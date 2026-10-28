// D:\Software\Magpie\agent-space-manager\server.mjs
// Local IPC & REST API Server for Agent Space Manager Web UI
// Allows Magpie WebView2 page to query filesystem, manage junctions, and resolve shortcuts.

import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  loadHubConfig,
  saveHubConfig,
  scanPlugins,
  syncIdePlugins,
  syncAllIdes,
  unlinkAllForIde,
  unlinkAllForProject,
  detectAgentConfigPath,
  resolveDroppedTarget,
  browseFileSystem,
  getEffectiveHubRoot,
  buildCategoriesRegistry,
  resolveHubRoot,
  listAgentProfilesForUi,
  inferAgentType,
} from "./manager.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAGPIE_PLUGINS_JSON = path.join(os.homedir(), ".config", "magpie", "plugins.json");
const SIBLING_DIRS = [
  __dirname,
  "D:\\Software\\Magpie\\agent-space-manager",
];

export const API_PORT = 41789;
let activeServer = null;
let magpieWatchInterval = null;
let lastMagpieStateSig = "";

function isAllowedOrigin(origin) {
  if (!origin || origin === "null") return true;
  if (origin.startsWith("file://") || origin.startsWith("magpie://") || origin.startsWith("app://")) return true;
  if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin)) return true;
  return false;
}

function setCorsHeaders(req, res) {
  const origin = req?.headers?.origin;
  if (isAllowedOrigin(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Private-Network", "true");
    res.setHeader("Access-Control-Max-Age", "86400");
    return true;
  }
  return false;
}

export function updatePluginsCache(hubRoot, plugins, categories = null) {
  try {
    const cats = categories || buildCategoriesRegistry(plugins, hubRoot);
    const payload = JSON.stringify(
      {
        path: String(hubRoot || ""),
        count: plugins.length,
        updatedAt: Date.now(),
        plugins,
        categories: cats,
      },
      null,
      2
    );

    const targetDirs = new Set();
    if (process.env.ASM_CACHE_DIR) {
      targetDirs.add(process.env.ASM_CACHE_DIR);
    } else {
      for (const base of SIBLING_DIRS) {
        const pDir = path.join(base, "page");
        if (fs.existsSync(pDir)) targetDirs.add(pDir);
      }
    }

    for (const cacheDir of targetDirs) {
      try {
        const cacheFile = path.join(cacheDir, "plugins-cache.json");
        fs.writeFileSync(cacheFile, payload, "utf8");
        const mainJsCache = path.join(cacheDir, "plugins-cache.js");
        fs.writeFileSync(mainJsCache, `window.__PLUGINS_CACHE__ = ${payload};\n`, "utf8");
      } catch {}
    }
  } catch (err) {
    console.warn("Failed to write plugins-cache.json:", err);
  }
}

export function syncFromMagpiePluginsJson(force = false) {
  try {
    if (!fs.existsSync(MAGPIE_PLUGINS_JSON)) return false;
    const raw = fs.readFileSync(MAGPIE_PLUGINS_JSON, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.plugins)) return false;

    const entry = parsed.plugins.find((p) => {
      const spec = String(p?.spec || "").toLowerCase();
      return spec.includes("agent-space-manager") || spec.includes("smart-middleware");
    });
    if (!entry || !entry.options) return false;

    const opts = entry.options;
    const sig = JSON.stringify({
      toolsRoot: opts.toolsRoot,
      hubConfig: opts.hubConfig,
      rescanNonce: opts.rescanNonce,
      smartMiddlewareEnabled: opts.smartMiddlewareEnabled,
      maxTools: opts.maxTools,
    });
    if (!force && sig === lastMagpieStateSig) return false;
    lastMagpieStateSig = sig;

    const baseCfg = loadHubConfig();
    const cfg = opts.hubConfig && typeof opts.hubConfig === "object"
      ? { ...baseCfg, ...opts.hubConfig }
      : baseCfg;

    if (!Array.isArray(cfg.ides)) {
      cfg.ides = Array.isArray(baseCfg.ides) ? baseCfg.ides : [
        {
          id: "antigravity",
          name: "Antigravity (Google Gemini)",
          agentType: "antigravity",
          exePath: path.join(os.homedir(), ".gemini", "bin", process.platform === "win32" ? "agy.cmd" : "agy"),
          configPath: detectAgentConfigPath("antigravity"),
          enabled: true,
          plugins: {},
        },
      ];
    }

    if (opts.toolsRoot !== undefined && (!opts.hubConfig || opts.hubConfig.hubRoot === undefined)) {
      cfg.hubRoot = String(opts.toolsRoot || "").trim();
    }
    if (!cfg.hubRoot || cfg.hubRoot.trim() === "") {
      cfg.hubRoot = resolveHubRoot();
    }
    if (opts.smartMiddlewareEnabled !== undefined) {
      cfg.smartMiddleware = { ...(cfg.smartMiddleware || {}), enabled: Boolean(opts.smartMiddlewareEnabled) };
    }
    if (opts.maxTools !== undefined && Number.isInteger(opts.maxTools)) {
      cfg.smartMiddleware = { ...(cfg.smartMiddleware || {}), maxTools: opts.maxTools };
    }

    saveHubConfig(cfg);
    const effPath = getEffectiveHubRoot(cfg);
    const plugins = scanPlugins(effPath);
    const categories = buildCategoriesRegistry(plugins, effPath);
    updatePluginsCache(effPath, plugins, categories);
    syncAllIdes(cfg, plugins);
    return true;
  } catch (err) {
    return false;
  }
}

function startMagpieConfigWatcher() {
  if (magpieWatchInterval || process.env.ASM_NO_SERVER) return;
  syncFromMagpiePluginsJson(true);
  magpieWatchInterval = setInterval(() => {
    syncFromMagpiePluginsJson(false);
  }, 350);
  if (typeof magpieWatchInterval.unref === "function") {
    magpieWatchInterval.unref();
  }
}

export function ensureBackgroundDaemon() {
  if (process.env.ASM_NO_SERVER || process.env.ASM_DAEMON_CHILD === "1") return;
  const req = http.get(`http://127.0.0.1:${API_PORT}/api/status`, { timeout: 600 }, (res) => {
    res.resume();
  });
  req.on("error", () => {
    try {
      const serverScript = path.join(__dirname, "server.mjs");
      const child = spawn(process.execPath, [serverScript, "--daemon"], {
        cwd: __dirname,
        detached: true,
        stdio: "ignore",
        windowsHide: true,
        env: { ...process.env, ASM_DAEMON_CHILD: "1" },
      });
      child.unref();
    } catch {}
  });
}

export function startApiServer(port = API_PORT) {
  if (activeServer && port === API_PORT) return activeServer;

  const server = http.createServer(async (req, res) => {
    const originAllowed = setCorsHeaders(req, res);

    if (req.method === "OPTIONS") {
      res.writeHead(originAllowed ? 200 : 403);
      res.end();
      return;
    }

    // Block cross-origin mutating requests from untrusted external websites
    if (!originAllowed && req.method !== "GET") {
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: "Forbidden origin" }));
      return;
    }

    const parsedUrl = new URL(req.url || "/", `http://127.0.0.1:${port}`);
    const pathname = parsedUrl.pathname;
    const query = Object.fromEntries(parsedUrl.searchParams.entries());

    try {
      if (pathname === "/api/status") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", port: server.address()?.port || port, timestamp: Date.now() }));
        return;
      }

      if (pathname === "/api/agents" && req.method === "GET") {
        const agents = listAgentProfilesForUi();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, agents }));
        return;
      }

      if (pathname === "/api/config" && req.method === "GET") {
        const cfg = loadHubConfig();
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(cfg));
        return;
      }

      if (pathname === "/api/plugins" && req.method === "GET") {
        const rawPath = query.path !== undefined ? String(query.path).trim() : "";
        const reqPath = rawPath || resolveHubRoot();
        const plugins = scanPlugins(reqPath);
        const categories = buildCategoriesRegistry(plugins, reqPath);
        updatePluginsCache(reqPath, plugins, categories);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, path: reqPath, count: plugins.length, plugins, categories }));
        return;
      }

      if (pathname === "/api/resolve" && req.method === "GET") {
        const rawPath = query.path ? String(query.path).trim() : "";
        const mode = query.mode ? String(query.mode).trim() : "ide";
        const result = resolveDroppedTarget(rawPath, mode);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
        return;
      }

      if (pathname === "/api/browse" && req.method === "GET") {
        const type = query.type ? String(query.type).trim() : "file";
        const result = await browseFileSystem(type);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
        return;
      }

      if (pathname === "/api/detect-config" && req.method === "GET") {
        const name = query.name ? String(query.name).trim() : "";
        const exePath = query.exePath ? String(query.exePath).trim() : "";
        const agentType = inferAgentType(name, exePath);
        const detected = detectAgentConfigPath(name, exePath);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, agentType, configPath: detected }));
        return;
      }

      if (pathname === "/api/save" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          try {
            const config = JSON.parse(body);
            saveHubConfig(config);
            const effPath = getEffectiveHubRoot(config);
            const plugins = scanPlugins(effPath);
            const categories = buildCategoriesRegistry(plugins, effPath);
            updatePluginsCache(effPath, plugins, categories);
            const syncRes = syncAllIdes(config, plugins);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true, pluginCount: plugins.length, plugins, categories, sync: syncRes }));
          } catch (err) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
        });
        return;
      }

      if (pathname === "/api/rescan" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          try {
            const data = body ? JSON.parse(body) : {};
            const config = loadHubConfig();
            if (data.hubRoot && typeof data.hubRoot === "string") {
              config.hubRoot = data.hubRoot.trim();
              saveHubConfig(config);
            }
            const effPath = getEffectiveHubRoot(config);
            const plugins = scanPlugins(effPath);
            const categories = buildCategoriesRegistry(plugins, effPath);
            updatePluginsCache(effPath, plugins, categories);
            const syncRes = syncAllIdes(config, plugins);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                success: true,
                hubRoot: effPath,
                pluginCount: plugins.length,
                plugins,
                categories,
                sync: syncRes,
                timestamp: Date.now(),
              })
            );
          } catch (err) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
        });
        return;
      }

      if (pathname === "/api/remove-ide" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          try {
            const { ideId, killProcesses } = JSON.parse(body || "{}");
            if (!ideId) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: false, error: "ideId required" }));
              return;
            }
            const config = loadHubConfig();
            const idx = (config.ides || []).findIndex((i) => i.id === ideId);
            if (idx === -1) {
              res.writeHead(404, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: false, error: `IDE '${ideId}' not found` }));
              return;
            }
            const [removedIde] = config.ides.splice(idx, 1);
            unlinkAllForIde(removedIde, killProcesses !== false);
            config.projects = (config.projects || []).filter((p) => p.ideId !== ideId);
            saveHubConfig(config);
            const effPath = getEffectiveHubRoot(config);
            const plugins = scanPlugins(effPath);
            const syncRes = syncAllIdes(config, plugins);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true, removed: ideId, sync: syncRes }));
          } catch (err) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
        });
        return;
      }

      if (pathname === "/api/remove-project" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          try {
            const { projectId } = JSON.parse(body || "{}");
            if (!projectId) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: false, error: "projectId required" }));
              return;
            }
            const config = loadHubConfig();
            const idx = (config.projects || []).findIndex((p) => p.id === projectId);
            if (idx === -1) {
              res.writeHead(404, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: false, error: `Project '${projectId}' not found` }));
              return;
            }
            const [removedProj] = config.projects.splice(idx, 1);
            const parentIde = (config.ides || []).find((i) => i.id === removedProj.ideId) || null;
            unlinkAllForProject(removedProj, parentIde);
            saveHubConfig(config);
            const effPath = getEffectiveHubRoot(config);
            const plugins = scanPlugins(effPath);
            const syncRes = syncAllIdes(config, plugins);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true, removed: projectId, sync: syncRes }));
          } catch (err) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
        });
        return;
      }

      // Serve static files from ./page directory
      if (!pathname.startsWith("/api")) {
        let cleanRel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
        let filePath = path.join(__dirname, "page", cleanRel);
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath).toLowerCase();
          const mimeTypes = {
            ".html": "text/html; charset=utf-8",
            ".js": "application/javascript; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".json": "application/json; charset=utf-8",
            ".png": "image/png",
            ".svg": "image/svg+xml",
          };
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");
          res.writeHead(200, { "Content-Type": mimeTypes[ext] || "text/plain" });
          fs.createReadStream(filePath).pipe(res);
          return;
        }
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Endpoint not found" }));
    } catch (err) {
      console.error("API Server Error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.log(`Port ${port} already in use, reusing active daemon.`);
    } else {
      console.error("API Server error:", err);
    }
  });

  server.listen(port, "127.0.0.1", () => {
    const actualPort = server.address()?.port || port;
    if (!process.env.ASM_NO_SERVER) {
      console.log(`Agent Space Manager API Server listening on http://127.0.0.1:${actualPort}`);
    }
  });

  if (port === API_PORT) {
    activeServer = server;
    startMagpieConfigWatcher();
  }
  return server;
}

if (process.argv[1] && process.argv[1].endsWith("server.mjs")) {
  startApiServer();
}
