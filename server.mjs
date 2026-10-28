// D:\Software\Magpie\agent-space-manager\server.mjs
// Local IPC & REST API Server for Agent Space Manager Web UI
// Allows Magpie WebView2 page to query filesystem, manage junctions, and resolve shortcuts.

import http from "node:http";
import url from "node:url";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  loadHubConfig,
  saveHubConfig,
  scanPlugins,
  syncIdePlugins,
  syncAllIdes,
  unlinkAllForIde,
  detectAgentConfigPath,
  resolveDroppedTarget,
  browseFileSystem,
  getEffectiveHubRoot,
  buildCategoriesRegistry,
  DEFAULT_HUB_ROOT,
} from "./manager.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const API_PORT = 41789;
let activeServer = null;

function setCorsHeaders(req, res) {
  const origin = req?.headers?.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function updatePluginsCache(hubRoot, plugins, categories = null) {
  try {
    const cats = categories || buildCategoriesRegistry(plugins, hubRoot);
    const payload = JSON.stringify(
      {
        path: hubRoot,
        count: plugins.length,
        updatedAt: Date.now(),
        plugins,
        categories: cats,
      },
      null,
      2
    );

    const cacheFile = path.join(__dirname, "page", "plugins-cache.json");
    fs.writeFileSync(cacheFile, payload, "utf8");
    const jsCacheFile = path.join(__dirname, "page", "plugins-cache.js");
    fs.writeFileSync(jsCacheFile, `window.__PLUGINS_CACHE__ = ${payload};`, "utf8");
  } catch (err) {
    console.warn("Failed to write plugins-cache.json:", err);
  }
}

export function startApiServer(port = API_PORT) {
  if (activeServer) return activeServer;

  // Immediately refresh plugin cache on startup from live filesystem
  try {
    const hubRoot = DEFAULT_HUB_ROOT;
    const plugins = scanPlugins(hubRoot);
    const categories = buildCategoriesRegistry(plugins, hubRoot);
    updatePluginsCache(hubRoot, plugins, categories);
  } catch {}

  const server = http.createServer(async (req, res) => {
    setCorsHeaders(req, res);

    if (req.method === "OPTIONS") {
      res.writeHead(200);
      res.end();
      return;
    }

    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const query = parsedUrl.query;

    try {
      if (pathname === "/api/status") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok", port, timestamp: Date.now() }));
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
        const reqPath = rawPath || DEFAULT_HUB_ROOT;
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
        const detected = detectAgentConfigPath(name, exePath);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true, configPath: detected }));
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
    console.log(`Agent Space Manager API Server listening on http://127.0.0.1:${port}`);
  });

  activeServer = server;
  return server;
}

// Auto-start when executed directly
if (process.argv[1] && process.argv[1].endsWith("server.mjs")) {
  startApiServer();
}
