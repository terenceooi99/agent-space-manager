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
  connectAgent,
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
  checkComponentsModifications,
  checkAndAutoReconnectOnStartup,
  getComponentsStorageSnapshot,
  recheckConnectedAgentsStatus,
  verifyPluginWorkabilityOnDisk,
  removeComponentUpdateMechanisms,
  checkCentralizedUpstreamUpdates,
  loadCentralizedUpstreamUpdateState,
  getOmniroutePort,
  isOmnirouteInstalled,
  checkOmnirouteStatus,
  startOmniroute,
  stopOmniroute,
  stopOmnirouteSync,
  isMagpieRunning,
  getLastOmnirouteStartAttempt,
  resetOmnirouteStartAttemptForTest,
  openUrlInBrowser,
  scanAgentForeignComponents,
  cleanAgentForeignComponents,
  autoEnableHubComponents,
} from "./manager.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MAGPIE_PLUGINS_JSON = path.join(os.homedir(), ".config", "magpie", "plugins.json");
const SIBLING_DIRS = [
  __dirname,
];

export const API_PORT = process.env.ASM_PORT ? parseInt(process.env.ASM_PORT, 10) : 41789;
let activeServer = null;
let magpieWatchInterval = null;
let lastMagpieStateSig = "";

function isAllowedOrigin(origin) {
  if (!origin || origin === "null") return true;
  if (
    origin.startsWith("file://") ||
    origin.startsWith("magpie://") ||
    origin.startsWith("app://") ||
    origin.startsWith("wails://") ||
    origin.startsWith("tauri://") ||
    origin.startsWith("vscode-webview://") ||
    origin.startsWith("vscode-file://") ||
    origin.startsWith("ms-appx-web://") ||
    origin.includes("htmlplatform.net") ||
    origin.startsWith("chrome-extension://")
  ) {
    return true;
  }
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
        path: "",
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
    } else if (process.env.ASM_TEST !== "1" && process.env.NODE_ENV !== "test") {
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
    handleOmnirouteRequest(opts.omnirouteRequest);
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

// --- OmniRoute bridge for the sandboxed Magpie page ---
// The page frame has no network and no popups, so it posts a request via
// magpie.options.set({ omnirouteRequest: { action, nonce, port } }); this
// watcher runs it and answers in page/omniroute-status.js (script-src 'self').
let lastOmnirouteNonce = null;
let omnirouteBusy = false;
let pendingOmnirouteRequest = null;

export function writeOmnirouteStatusFile(payload) {
  try {
    const targetDirs = new Set();
    if (process.env.ASM_CACHE_DIR) {
      targetDirs.add(process.env.ASM_CACHE_DIR);
    } else if (process.env.ASM_TEST !== "1" && process.env.NODE_ENV !== "test") {
      for (const base of SIBLING_DIRS) {
        const pDir = path.join(base, "page");
        if (fs.existsSync(pDir)) targetDirs.add(pDir);
      }
      targetDirs.add(path.join(__dirname, "page"));
    }

    const content = `window.__OMNIROUTE_STATUS__ = ${JSON.stringify(payload)};\n`;
    for (const dir of targetDirs) {
      try {
        const file = path.join(dir, "omniroute-status.js");
        const tmp = `${file}.tmp`;
        fs.writeFileSync(tmp, content, "utf8");
        fs.renameSync(tmp, file);
      } catch {}
    }
  } catch {}
}

let lastOmnirouteStartAttempt = 0;

export function clearOmnirouteRequestFromPluginsJson(nonceToClear = null) {
  try {
    if (!fs.existsSync(MAGPIE_PLUGINS_JSON)) return;
    const raw = fs.readFileSync(MAGPIE_PLUGINS_JSON, "utf8");
    const parsed = JSON.parse(raw);
    const entry = (parsed?.plugins || []).find((p) => {
      const spec = String(p?.spec || "").toLowerCase();
      return spec.includes("agent-space-manager") || spec.includes("smart-middleware");
    });
    if (entry?.options?.omnirouteRequest) {
      if (!nonceToClear || entry.options.omnirouteRequest.nonce === nonceToClear) {
        delete entry.options.omnirouteRequest;
        fs.writeFileSync(MAGPIE_PLUGINS_JSON, JSON.stringify(parsed, null, 2), "utf8");
      }
    }
  } catch {}
}

export async function runOmnirouteAction(action = "status", port = null, nonce = null) {
  const cfg = loadHubConfig();
  const effectivePort = port || getOmniroutePort(cfg);
  let status;
  if (action === "start") {
    lastOmnirouteStartAttempt = Date.now();
    // Immediate progress write to inform polling clients that startup is underway
    writeOmnirouteStatusFile({
      installed: true,
      running: false,
      port: effectivePort,
      url: `http://localhost:${effectivePort}`,
      action: "start",
      nonce,
      state: "starting",
      checkedAt: Date.now(),
    });
    const started = await startOmniroute(port, cfg);
    status = await checkOmnirouteStatus(port, cfg);
    if (!status.running && started?.error) status.error = started.error;
  } else if (action === "stop") {
    const stopped = await stopOmniroute(port, cfg);
    status = await checkOmnirouteStatus(port, cfg);
    if (status.running && stopped?.error) status.error = stopped.error;
  } else if (action === "open") {
    status = await checkOmnirouteStatus(port, cfg);
    if (!status.running) {
      startOmniroute(port, cfg).catch(() => {});
    }
    const targetUrl = status.url || `http://localhost:${port || getOmniroutePort(cfg)}`;
    status.opened = openUrlInBrowser(targetUrl);
  } else {
    status = await checkOmnirouteStatus(port, cfg);
  }
  const payload = { ...status, action, nonce, checkedAt: Date.now() };
  writeOmnirouteStatusFile(payload);
  if (nonce) {
    clearOmnirouteRequestFromPluginsJson(nonce);
  }
  return payload;
}

export function handleOmnirouteRequest(req) {
  if (!req || typeof req !== "object" || !req.nonce) return;
  if (req.nonce === lastOmnirouteNonce) return;
  if (omnirouteBusy) {
    pendingOmnirouteRequest = req;
    return;
  }
  lastOmnirouteNonce = req.nonce;
  omnirouteBusy = true;
  const port = Number.isInteger(Number(req.port)) && Number(req.port) > 0 ? Number(req.port) : null;
  runOmnirouteAction(String(req.action || "status"), port, req.nonce)
    .catch(() => {})
    .finally(() => {
      omnirouteBusy = false;
      if (pendingOmnirouteRequest) {
        const next = pendingOmnirouteRequest;
        pendingOmnirouteRequest = null;
        handleOmnirouteRequest(next);
      }
    });
}

let magpieWasRunning = false;
let magpieDeadTicks = 0;

export function resetMagpieLivenessForTest() {
  magpieWasRunning = false;
  magpieDeadTicks = 0;
  lastOmnirouteStartAttempt = 0;
  if (typeof resetOmnirouteStartAttemptForTest === "function") {
    resetOmnirouteStartAttemptForTest();
  }
}

export async function handleMagpieLivenessCheck(magpieAlive, customPort = null, stopFn = stopOmniroute) {
  if (magpieAlive) {
    magpieWasRunning = true;
    magpieDeadTicks = 0;
    return { magpieAlive: true, omnirouteStopped: false };
  }

  // Prevent killing newly enabled OmniRoute during its startup window (30s)
  const effectiveStartAttempt = Math.max(
    lastOmnirouteStartAttempt,
    typeof getLastOmnirouteStartAttempt === "function" ? getLastOmnirouteStartAttempt() : 0
  );
  const timeSinceStart = Date.now() - effectiveStartAttempt;
  if (timeSinceStart < 30000) {
    return { magpieAlive: false, omnirouteStopped: false, startingUp: true };
  }

  magpieDeadTicks++;
  // Require at least 2 consecutive dead checks (approx 4 seconds) to prevent false positives from transient network jitter
  if (magpieDeadTicks >= 2) {
    magpieWasRunning = false;
    const st = await checkOmnirouteStatus(customPort);
    if (st.running) {
      const stoppedSt = await stopFn(customPort);
      writeOmnirouteStatusFile({
        ...stoppedSt,
        action: "stop",
        stoppedReason: "magpie-not-running",
        checkedAt: Date.now(),
      });
      return { magpieAlive: false, omnirouteStopped: true, status: stoppedSt };
    }
    return { magpieAlive: false, omnirouteStopped: false, alreadyStopped: true };
  }
  return { magpieAlive: false, omnirouteStopped: false, ticks: magpieDeadTicks };
}

export function startMagpieConfigWatcher() {
  if (magpieWatchInterval || process.env.ASM_NO_SERVER) return;
  // Initialize lastOmnirouteNonce from plugins.json on startup to avoid replaying any old requests
  try {
    const parsed = JSON.parse(fs.readFileSync(MAGPIE_PLUGINS_JSON, "utf8"));
    const entry = (parsed?.plugins || []).find((p) => String(p?.spec || "").toLowerCase().includes("agent-space-manager"));
    lastOmnirouteNonce = entry?.options?.omnirouteRequest?.nonce || null;
    clearOmnirouteRequestFromPluginsJson();
  } catch {}
  // During startup, check status health
  runOmnirouteAction("status").catch(() => {});
  // If Magpie is not running on startup, shut down running OmniRoute immediately (after startup grace window)
  if (process.env.ASM_TEST !== "1" && process.env.NODE_ENV !== "test") {
    isMagpieRunning().then(async (alive) => {
      if (!alive) {
        const effectiveStartAttempt = Math.max(
          lastOmnirouteStartAttempt,
          typeof getLastOmnirouteStartAttempt === "function" ? getLastOmnirouteStartAttempt() : 0
        );
        if (Date.now() - effectiveStartAttempt < 30000) {
          return;
        }
        magpieDeadTicks = 2;
        const st = await checkOmnirouteStatus();
        if (st.running) {
          const stoppedSt = await stopOmniroute();
          writeOmnirouteStatusFile({
            ...stoppedSt,
            action: "stop",
            stoppedReason: "magpie-not-running",
            checkedAt: Date.now(),
          });
        }
      } else {
        magpieWasRunning = true;
        magpieDeadTicks = 0;
      }
    }).catch(() => {});
  }
  syncFromMagpiePluginsJson(true);
  magpieWatchInterval = setInterval(() => {
    syncFromMagpiePluginsJson(false);
    if (process.env.ASM_TEST !== "1" && process.env.NODE_ENV !== "test") {
      isMagpieRunning().then((magpieAlive) => {
        handleMagpieLivenessCheck(magpieAlive).catch(() => {});
      }).catch(() => {});
    }
  }, 2000);
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

      if (pathname === "/api/omniroute/status" && req.method === "GET") {
        const portParam = query.port ? parseInt(query.port, 10) : null;
        const cfg = loadHubConfig();
        const status = await checkOmnirouteStatus(portParam, cfg);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, ...status }));
        return;
      }

      if (pathname === "/action-omniroute.js" || pathname === "/api/omniroute/action.js") {
        const action = query.action || "status";
        const portParam = query.port ? parseInt(query.port, 10) : null;
        const nonce = query.nonce || null;
        const payload = await runOmnirouteAction(action, portParam, nonce);
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8" });
        res.end(`window.__OMNIROUTE_STATUS__ = ${JSON.stringify(payload)};\n`);
        return;
      }

      if (pathname === "/api/omniroute/start") {
        if (req.method === "GET") {
          const port = query.port ? parseInt(query.port, 10) : null;
          const payload = await runOmnirouteAction("start", port);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(payload));
          return;
        }
        if (req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => { body += chunk; });
          req.on("end", async () => {
            try {
              const data = body ? JSON.parse(body) : {};
              const payload = await runOmnirouteAction("start", data.port);
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify(payload));
            } catch (err) {
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
          return;
        }
      }

      if (pathname === "/api/omniroute/stop") {
        if (req.method === "GET") {
          const port = query.port ? parseInt(query.port, 10) : null;
          const payload = await runOmnirouteAction("stop", port);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(payload));
          return;
        }
        if (req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => { body += chunk; });
          req.on("end", async () => {
            try {
              const data = body ? JSON.parse(body) : {};
              const payload = await runOmnirouteAction("stop", data.port);
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify(payload));
            } catch (err) {
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
          return;
        }
      }

      if (pathname === "/api/omniroute/open") {
        if (req.method === "GET") {
          const cfg = loadHubConfig();
          const port = query.port ? parseInt(query.port, 10) : getOmniroutePort(cfg);
          const targetUrl = query.url || `http://localhost:${port}`;
          const ok = openUrlInBrowser(targetUrl);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: ok, url: targetUrl }));
          return;
        }
        if (req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => { body += chunk; });
          req.on("end", () => {
            try {
              const data = body ? JSON.parse(body) : {};
              const cfg = loadHubConfig();
              const port = data.port || getOmniroutePort(cfg);
              const targetUrl = data.url || query.url || `http://localhost:${port}`;
              const ok = openUrlInBrowser(targetUrl);
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: ok, url: targetUrl }));
            } catch (err) {
              res.writeHead(500, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
          return;
        }
      }

      if (pathname === "/api/agent/scan-foreign" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          try {
            const data = body ? JSON.parse(body) : {};
            const agentDef = data.agent || data.ide || data;
            const cfg = loadHubConfig();
            const effHub = getEffectiveHubRoot(cfg);
            const plugins = scanPlugins(effHub);
            const scan = scanAgentForeignComponents(agentDef, cfg, plugins);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true, ...scan }));
          } catch (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
        });
        return;
      }

      if (pathname === "/api/agent/clean-foreign" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          try {
            const data = body ? JSON.parse(body) : {};
            const components = Array.isArray(data.components) ? data.components : [];
            const result = cleanAgentForeignComponents(components);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(result));
          } catch (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
        });
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

      if (pathname === "/api/check-modifications" && req.method === "GET") {
        const rawPath = query.path !== undefined ? String(query.path).trim() : "";
        const reqPath = rawPath || resolveHubRoot();
        const result = checkComponentsModifications(reqPath);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, ...result }));
        return;
      }

      if (pathname === "/api/startup-sync" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          try {
            const customCfg = body ? JSON.parse(body) : null;
            const result = checkAndAutoReconnectOnStartup(customCfg);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(result));
          } catch (err) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
        });
        return;
      }

      if (pathname === "/api/central-update-check" && (req.method === "GET" || req.method === "POST")) {
        const handleCheck = (force, reqPath) => {
          try {
            const cleanPath = reqPath || resolveHubRoot();
            const result = checkCentralizedUpstreamUpdates(cleanPath, { force });
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(result));
          } catch (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
        };

        if (req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => { body += chunk; });
          req.on("end", () => {
            try {
              const data = body ? JSON.parse(body) : {};
              handleCheck(Boolean(data.force), data.hubRoot);
            } catch (err) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
          return;
        } else {
          const rawPath = query.path !== undefined ? String(query.path).trim() : "";
          const force = query.force === "true" || query.force === "1";
          handleCheck(force, rawPath);
          return;
        }
      }

      if (pathname === "/api/central-update-status" && req.method === "GET") {
        const rawPath = query.path !== undefined ? String(query.path).trim() : "";
        const cleanPath = rawPath || resolveHubRoot();
        const state = loadCentralizedUpstreamUpdateState(cleanPath);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, state: state || null }));
        return;
      }

      if ((pathname === "/api/recheck-status" || pathname === "/api/recheck-status-dots") && (req.method === "GET" || req.method === "POST")) {
        const handleRecheck = (customCfg) => {
          try {
            const cfg = customCfg || loadHubConfig();
            const effHub = getEffectiveHubRoot(cfg);
            const plugins = scanPlugins(effHub);
            const statusResult = recheckConnectedAgentsStatus(cfg, plugins);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: true, ...statusResult }));
          } catch (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
        };

        if (req.method === "POST") {
          let body = "";
          req.on("data", (chunk) => { body += chunk; });
          req.on("end", () => {
            try {
              const customCfg = body ? JSON.parse(body) : null;
              handleRecheck(customCfg);
            } catch {
              handleRecheck(null);
            }
          });
        } else {
          handleRecheck(null);
        }
        return;
      }

      if (pathname === "/api/connect" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          try {
            const parsed = JSON.parse(body || "{}");
            const targetIde = parsed.ide && typeof parsed.ide === "object" ? parsed.ide : parsed;
            if (!targetIde || (!targetIde.id && !targetIde.agentType)) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: false, error: "Missing required agent id or agentType" }));
              return;
            }

            const config = loadHubConfig();
            const effHub = getEffectiveHubRoot(config);
            const customPlugins = Array.isArray(parsed.plugins) ? parsed.plugins : null;
            const connectRes = connectAgent(config, targetIde, {
              effHub,
              customPlugins,
            });

            // Ensure bridge and activeAgents are populated from file or return object
            let bridge = connectRes.bridge || null;
            let activeAgents = connectRes.activeAgents || [];
            if (!bridge || Object.keys(bridge).length === 0) {
              try {
                const bridgePath = path.join(effHub, "agent-space-bridge.json");
                if (fs.existsSync(bridgePath)) {
                  bridge = JSON.parse(fs.readFileSync(bridgePath, "utf8"));
                  activeAgents = bridge.activeAgents || [];
                }
              } catch {}
            }

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                success: connectRes.success !== false,
                bridge: bridge || {},
                activeAgents: activeAgents.length > 0 ? activeAgents : (bridge?.activeAgents || []),
                result: connectRes.result || connectRes.sync || connectRes,
                hubConfig: connectRes.hubConfig || config,
              })
            );
          } catch (err) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
        });
        return;
      }

      if (pathname === "/api/save" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          try {
            const raw = JSON.parse(body || "{}");
            const config = raw.config && typeof raw.config === "object" ? raw.config : raw;
            const shouldSync = Boolean(
              raw.sync === true ||
              raw.connect === true ||
              config.sync === true ||
              config.connect === true
            );

            saveHubConfig(config);
            const effPath = getEffectiveHubRoot(config);
            const plugins = Array.isArray(raw.plugins) ? raw.plugins : scanPlugins(effPath);
            const categories = buildCategoriesRegistry(plugins, effPath);
            updatePluginsCache(effPath, plugins, categories);

            let syncRes = null;
            if (shouldSync) {
              syncRes = syncAllIdes(config, plugins);
            }

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                success: true,
                config,
                pluginCount: plugins.length,
                plugins,
                categories,
                synced: shouldSync,
                ...(syncRes ? { sync: syncRes } : {}),
              })
            );
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
            unlinkAllForIde(removedIde, killProcesses === true);
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
      console.error(`Port ${port} already in use, reusing active daemon.`);
    } else {
      console.error("API Server error:", err);
    }
  });

  server.listen(port, "127.0.0.1", () => {
    const actualPort = server.address()?.port || port;
    if (!process.env.ASM_NO_SERVER) {
      console.error(`Agent Space Manager API Server listening on http://127.0.0.1:${actualPort}`);
    }
  });

  if (port === API_PORT) {
    activeServer = server;
    try {
      const startupRes = checkAndAutoReconnectOnStartup();
      if (!process.env.ASM_NO_SERVER && process.env.NODE_ENV !== "test" && process.env.ASM_TEST !== "1") {
        console.error(`[Startup] Components Storage Path: ${startupRes.summary}`);
        if (startupRes.autoReconnected) {
          console.error(`[Startup] Auto-reconnected ${startupRes.connectedAgentsCount} connected agent(s).`);
        }
        if (startupRes.centralUpdates?.checked) {
          console.error(`[Startup] Central Upstream Update: ${startupRes.centralUpdates.summary}`);
        }
      }
    } catch {}
    startMagpieConfigWatcher();
  }
  return server;
}

if (process.argv[1] && process.argv[1].endsWith("server.mjs")) {
  startApiServer();
}

if (!process.env.ASM_NO_SERVER && process.env.NODE_ENV !== "test" && process.env.ASM_TEST !== "1") {
  const onProcessSignal = () => {
    try {
      stopOmnirouteSync();
    } catch {}
    process.exit(0);
  };
  process.on("SIGINT", onProcessSignal);
  process.on("SIGTERM", onProcessSignal);
}
