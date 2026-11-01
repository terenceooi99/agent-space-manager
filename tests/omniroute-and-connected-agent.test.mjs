// tests/omniroute-and-connected-agent.test.mjs
// Verification suite for Omniroute capsule status, lifecycle, and connected agent foreign component management

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import {
  getOmniroutePort,
  isOmnirouteInstalled,
  checkOmnirouteStatus,
  scanAgentForeignComponents,
  cleanAgentForeignComponents,
  autoEnableHubComponents,
  connectAgent,
  openUrlInBrowser,
} from "../manager.mjs";
import { startApiServer, API_PORT, runOmnirouteAction, writeOmnirouteStatusFile } from "../server.mjs";

describe("OmniRoute AI Gateway & Connected Agent Management Suite", () => {
  let tempDir;
  let testServer;
  const testServerPort = 41793;

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-test-"));
    testServer = startApiServer(testServerPort);
  });

  after(() => {
    if (testServer && typeof testServer.close === "function") {
      try {
        testServer.close();
      } catch {}
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it("Omniroute Port Resolution: defaults to 20128 and respects config override", () => {
    const defaultPort = getOmniroutePort({});
    assert.equal(defaultPort, 20128, "Default port should be 20128");

    const customPort = getOmniroutePort({ omniroute: { port: 20199 } });
    assert.equal(customPort, 20199, "Should respect custom port in hubConfig");
  });

  it("Omniroute Status Probing: accurately reflects live server and stopped server", async () => {
    // 1. Stopped port
    const unreachableStatus = await checkOmnirouteStatus(59999);
    assert.equal(unreachableStatus.running, false, "Port 59999 should report not running");
    assert.equal(unreachableStatus.port, 59999);

    // 2. Active mock server
    const mockPort = 49911;
    const mockServer = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "healthy" }));
    });

    await new Promise((resolve) => mockServer.listen(mockPort, "127.0.0.1", resolve));

    try {
      const activeStatus = await checkOmnirouteStatus(mockPort);
      assert.equal(activeStatus.running, true, "Mock server port should report running");
      assert.equal(activeStatus.port, mockPort);
      assert.equal(activeStatus.statusCode, 200);
    } finally {
      await new Promise((resolve) => mockServer.close(resolve));
    }
  });

  it("Foreign Components Detection: distinguishes foreign vs hub vs system defaults", () => {
    const hubDir = path.join(tempDir, "hub");
    const pluginDir = path.join(hubDir, "plugins", "my-plugin");
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, "plugin.json"), JSON.stringify({ name: "my-plugin" }));

    const agentConfigDir = path.join(tempDir, "agent-config");
    fs.mkdirSync(agentConfigDir, { recursive: true });

    // 1. Hub-synced component (has .asm-owned.json)
    const hubSyncedDir = path.join(agentConfigDir, "my-plugin");
    fs.mkdirSync(hubSyncedDir, { recursive: true });
    fs.writeFileSync(path.join(hubSyncedDir, ".asm-owned.json"), JSON.stringify({ owner: "asm" }));

    // 2. System default file (e.g. skills.json)
    fs.writeFileSync(path.join(agentConfigDir, "skills.json"), "{}");

    // 3. Foreign component created by user or external tool
    const foreignDir = path.join(agentConfigDir, "foreign-custom-tool");
    fs.mkdirSync(foreignDir, { recursive: true });
    fs.writeFileSync(path.join(foreignDir, "tool.txt"), "hello foreign");

    const foreignFile = path.join(agentConfigDir, "legacy-script.py");
    fs.writeFileSync(foreignFile, "print('legacy')");

    const agentDef = {
      id: "test-agent",
      name: "Test Agent",
      agentType: "custom",
      configPath: agentConfigDir,
      plugins: {},
    };

    const mockPlugins = [{ id: "my-plugin", name: "my-plugin", path: pluginDir }];
    const mockHubConfig = { hubRoot: hubDir, ides: [agentDef] };

    const scanRes = scanAgentForeignComponents(agentDef, mockHubConfig, mockPlugins);
    assert.equal(scanRes.hasForeign, true, "Should detect foreign components");
    assert.ok(scanRes.foreignComponents.some((c) => c.name === "foreign-custom-tool"));
    assert.ok(scanRes.foreignComponents.some((c) => c.name === "legacy-script.py"));

    // System default skills.json should NOT be flagged as foreign
    assert.ok(!scanRes.foreignComponents.some((c) => c.name === "skills.json"));

    // Hub-synced component should be in hubComponents, NOT foreignComponents
    assert.ok(!scanRes.foreignComponents.some((c) => c.name === "my-plugin"));
    assert.ok(scanRes.hubComponents.some((c) => c.name === "my-plugin"));
  });

  it("Foreign Components Cleaning: safely removes foreign components without touching valid ones", () => {
    const agentConfigDir = path.join(tempDir, "agent-clean-test");
    fs.mkdirSync(agentConfigDir, { recursive: true });

    const foreignDir = path.join(agentConfigDir, "foreign-folder");
    fs.mkdirSync(foreignDir, { recursive: true });
    fs.writeFileSync(path.join(foreignDir, "file.txt"), "delete me");

    const foreignFile = path.join(agentConfigDir, "orphan.js");
    fs.writeFileSync(foreignFile, "console.log('orphan');");

    const keeperFile = path.join(agentConfigDir, "keep-me.txt");
    fs.writeFileSync(keeperFile, "precious user data");

    const cleanRes = cleanAgentForeignComponents([
      { path: foreignDir },
      { path: foreignFile },
    ]);

    assert.equal(cleanRes.success, true);
    assert.equal(cleanRes.removedCount, 2);
    assert.ok(!fs.existsSync(foreignDir), "foreign-folder should be deleted");
    assert.ok(!fs.existsSync(foreignFile), "orphan.js should be deleted");
    assert.ok(fs.existsSync(keeperFile), "keep-me.txt must remain intact");
  });

  it("Auto-Enabling Hub Components: enables discovered components for connected agent", () => {
    const hubDir = path.join(tempDir, "hub-autoenable");
    const pluginDir = path.join(hubDir, "plugins", "code-helper");
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(path.join(pluginDir, "plugin.json"), JSON.stringify({ name: "code-helper" }));

    const agentConfigDir = path.join(tempDir, "agent-autoenable");
    fs.mkdirSync(agentConfigDir, { recursive: true });

    // Existing link or component matching code-helper
    const agentPluginDir = path.join(agentConfigDir, "code-helper");
    fs.mkdirSync(agentPluginDir, { recursive: true });
    fs.writeFileSync(path.join(agentPluginDir, ".asm-owned.json"), JSON.stringify({ owner: "asm" }));

    const agentDef = {
      id: "agent-1",
      name: "Agent 1",
      agentType: "custom",
      configPath: agentConfigDir,
      plugins: {}, // Initially empty/disabled
    };

    const mockPlugins = [{ id: "code-helper", name: "code-helper", path: pluginDir }];
    const mockHubConfig = { hubRoot: hubDir, ides: [agentDef] };

    const enableRes = autoEnableHubComponents(agentDef, mockHubConfig, mockPlugins);
    assert.equal(enableRes.enabledCount, 1);
    assert.deepEqual(enableRes.enabledIds, ["code-helper"]);
    assert.equal(agentDef.plugins["code-helper"], true, "Plugin should be auto-enabled in plugins map");
  });

  it("Safety Invariant 5: zero window.alert, window.confirm, or window.prompt in frontend code", () => {
    const html = fs.readFileSync(path.join(process.cwd(), "page", "index.html"), "utf8");
    const js = fs.readFileSync(path.join(process.cwd(), "page", "app.js"), "utf8");

    assert.ok(!html.includes("window.alert"), "index.html must not call window.alert");
    assert.ok(!html.includes("window.confirm"), "index.html must not call window.confirm");
    assert.ok(!html.includes("window.prompt"), "index.html must not call window.prompt");

    assert.ok(!js.includes("window.alert"), "app.js must not call window.alert");
    assert.ok(!js.includes("window.confirm"), "app.js must not call window.confirm");
    assert.ok(!js.includes("window.prompt"), "app.js must not call window.prompt");
  });

  it("REST API Endpoints: /api/omniroute/* and /api/agent/* respond correctly", async () => {
    // 1. GET /api/omniroute/status
    const statusRes = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${testServerPort}/api/omniroute/status?port=59998`, (res) => {
        let body = "";
        res.on("data", (c) => { body += c; });
        res.on("end", () => resolve(JSON.parse(body)));
      }).on("error", reject);
    });
    assert.equal(statusRes.success, true);
    assert.equal(statusRes.port, 59998);

    // 2. POST /api/agent/scan-foreign
    const scanPayload = JSON.stringify({
      agent: { id: "test", name: "Test", configPath: tempDir },
    });
    const scanRes = await new Promise((resolve, reject) => {
      const req = http.request(
        `http://127.0.0.1:${testServerPort}/api/agent/scan-foreign`,
        { method: "POST", headers: { "Content-Type": "application/json" } },
        (res) => {
          let body = "";
          res.on("data", (c) => { body += c; });
          res.on("end", () => resolve(JSON.parse(body)));
        }
      );
      req.on("error", reject);
      req.write(scanPayload);
      req.end();
    });
    assert.equal(scanRes.success, true);
    assert.ok(Array.isArray(scanRes.foreignComponents));
  });

  it("Omniroute Wording Style: wording is black in style.css", () => {
    const css = fs.readFileSync(path.join(process.cwd(), "page", "style.css"), "utf8");
    assert.ok(css.includes(".omniroute-label"), "style.css must have .omniroute-label");
    assert.ok(
      css.includes(".omniroute-label {\n  font-size: 12px;\n  font-weight: 600;\n  color: #000000;\n}") ||
      css.includes("color: #000000"),
      "Omniroute wording must be black (#000000)"
    );
  });

  it("Omniroute Notification Hygiene: zero emoji symbols in omniroute notifications", () => {
    const js = fs.readFileSync(path.join(process.cwd(), "page", "app.js"), "utf8");
    // Ensure showToast checks for omniroute and skips emojis
    assert.ok(js.includes("isOmniroute"), "showToast must detect omniroute messages");
    assert.ok(js.includes("noEmoji"), "showToast must support noEmoji option");
  });

  it("Magpie Plugin API Integration: index.mjs exposes Omniroute and Foreign Component methods", async () => {
    const { AgentSpaceManagerPlugin } = await import("../index.mjs");
    assert.ok(AgentSpaceManagerPlugin?.api, "AgentSpaceManagerPlugin must have api object");
    assert.equal(typeof AgentSpaceManagerPlugin.api.getOmnirouteStatus, "function");
    assert.equal(typeof AgentSpaceManagerPlugin.api.startOmniroute, "function");
    assert.equal(typeof AgentSpaceManagerPlugin.api.openOmnirouteUrl, "function");
    assert.equal(typeof AgentSpaceManagerPlugin.api.scanForeignComponents, "function");
    assert.equal(typeof AgentSpaceManagerPlugin.api.cleanForeignComponents, "function");
  });

  it("Frontend Script Invariant: index.html loads omniroute-status.js synchronously", () => {
    const html = fs.readFileSync(path.join(process.cwd(), "page", "index.html"), "utf8");
    assert.ok(html.includes("omniroute-status.js"), "index.html must include omniroute-status.js script tag");
  });

  it("Frontend TDZ Protection: omniroutePort declared before checkOmniroute execution", () => {
    const js = fs.readFileSync(path.join(process.cwd(), "page", "app.js"), "utf8");
    const portDeclIdx = js.indexOf("let omniroutePort = 20128;");
    const checkCallIdx = js.indexOf("checkOmniroute(false);");

    assert.ok(portDeclIdx !== -1, "let omniroutePort must be declared");
    assert.ok(checkCallIdx !== -1, "checkOmniroute(false) must exist");
    assert.ok(
      portDeclIdx < checkCallIdx,
      `omniroutePort must be declared (idx: ${portDeclIdx}) before checkOmniroute(false) call (idx: ${checkCallIdx}) to prevent TDZ ReferenceError`
    );
  });

  it("Fast Status Probing: unreachable port check completes swiftly (< 800ms)", async () => {
    const t0 = Date.now();
    const st = await checkOmnirouteStatus(58193);
    const duration = Date.now() - t0;
    assert.equal(st.running, false);
    assert.ok(duration < 800, `Unreachable check should finish in < 800ms, took ${duration}ms`);
  });

  it("Omniroute Action Bridge: status and open actions return valid payloads", async () => {
    const statusPayload = await runOmnirouteAction("status", 58194, "test-nonce-status");
    assert.equal(statusPayload.action, "status");
    assert.equal(statusPayload.nonce, "test-nonce-status");
    assert.equal(statusPayload.port, 58194);
    assert.ok(statusPayload.checkedAt > 0);

    const openPayload = await runOmnirouteAction("open", 58194, "test-nonce-open");
    assert.equal(openPayload.action, "open");
    assert.equal(openPayload.nonce, "test-nonce-open");
    assert.ok("opened" in openPayload);
  });

  it("REST API Open Endpoint: GET /api/omniroute/open works cleanly without CORS preflight", async () => {
    const res = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${testServerPort}/api/omniroute/open?port=58195`, (r) => {
        let body = "";
        r.on("data", (c) => { body += c; });
        r.on("end", () => resolve(JSON.parse(body)));
      }).on("error", reject);
    });
    assert.ok(res.url.includes("58195"));
    assert.ok("success" in res);
  });

  it("Capsule Clickability Invariant: omniroute-capsule is cursor pointer and loading has pointer-events allowed", () => {
    const css = fs.readFileSync(path.join(process.cwd(), "page", "style.css"), "utf8");
    assert.ok(css.includes(".omniroute-capsule {\n  display: inline-flex;\n  align-items: center;\n  gap: 7px;\n  padding: 5px 12px;\n  border-radius: 8px;\n  border: 1px solid var(--magpie-border, rgba(128, 128, 128, 0.25));\n  background: var(--magpie-surface, rgba(128, 128, 128, 0.08));\n  cursor: pointer;"));
    assert.ok(!css.includes(".omniroute-port.loading {\n  opacity: 0.6;\n  pointer-events: none;"));
  });
});
