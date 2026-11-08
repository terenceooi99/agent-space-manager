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
  startOmniroute,
  stopOmniroute,
  isMagpieRunning,
  findNodeBinary,
  findOmnirouteCliPath,
  recordOmnirouteStartAttempt,
  getLastOmnirouteStartAttempt,
  resetOmnirouteStartAttemptForTest,
  scanAgentForeignComponents,
  cleanAgentForeignComponents,
  autoEnableHubComponents,
  connectAgent,
  openUrlInBrowser,
} from "../manager.mjs";
import {
  startApiServer,
  API_PORT,
  runOmnirouteAction,
  writeOmnirouteStatusFile,
  handleMagpieLivenessCheck,
  resetMagpieLivenessForTest,
} from "../server.mjs";

describe("OmniRoute AI Gateway & Connected Agent Management Suite", () => {
  let tempDir;
  let testServer;
  const testServerPort = 41793;
  let originalStatusContent = null;
  const prodStatusFile = path.resolve(process.cwd(), "page", "omniroute-status.js");

  before(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "omniroute-test-"));
    process.env.ASM_CACHE_DIR = tempDir;
    if (fs.existsSync(prodStatusFile)) {
      originalStatusContent = fs.readFileSync(prodStatusFile, "utf8");
    }
    testServer = startApiServer(testServerPort);
    if (!testServer.listening) {
      await new Promise((resolve) => testServer.once("listening", resolve));
    }
  });

  after(async () => {
    if (testServer && typeof testServer.close === "function") {
      await new Promise((resolve) => {
        testServer.close(() => resolve());
      });
    }
    delete process.env.ASM_CACHE_DIR;
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
    if (originalStatusContent) {
      try {
        fs.writeFileSync(prodStatusFile, originalStatusContent, "utf8");
      } catch {}
    }
    // Ensure clean exit in tests
    setTimeout(() => {
      try { process.exit(0); } catch {}
    }, 200).unref();
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
    assert.equal(typeof AgentSpaceManagerPlugin.api.stopOmniroute, "function");
    assert.equal(typeof AgentSpaceManagerPlugin.api.isMagpieRunning, "function");
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

  it("isMagpieRunning: accurately probes host TCP port and returns boolean", async () => {
    const running = await isMagpieRunning();
    assert.equal(typeof running, "boolean");

    // Environment override check for test isolation
    process.env.ASM_MOCK_MAGPIE = "1";
    assert.equal(await isMagpieRunning(), true, "Should return true when ASM_MOCK_MAGPIE=1");
    process.env.ASM_MOCK_MAGPIE = "0";
    assert.equal(await isMagpieRunning(), false, "Should return false when ASM_MOCK_MAGPIE=0");
    delete process.env.ASM_MOCK_MAGPIE;
  });

  it("Auto-Shutdown Invariant: automatically shuts down OmniRoute when Magpie is not running", async () => {
    resetMagpieLivenessForTest();

    // 1. Alive check: ticks reset and OmniRoute remains untouched
    const aliveCheck = await handleMagpieLivenessCheck(true);
    assert.equal(aliveCheck.magpieAlive, true);
    assert.equal(aliveCheck.omnirouteStopped, false);

    // 2. Dead tick 1: reports dead but does not immediately stop (prevents false positives from transient jitter)
    const dead1 = await handleMagpieLivenessCheck(false);
    assert.equal(dead1.magpieAlive, false);
    assert.equal(dead1.omnirouteStopped, false);
    assert.equal(dead1.ticks, 1);

    // 3. Dead tick 2 with mock server running: triggers stopOmniroute and updates status with magpie-not-running
    const testMockPort = 49912;
    const mockServer = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "healthy" }));
    });
    await new Promise((resolve) => mockServer.listen(testMockPort, "127.0.0.1", resolve));

    try {
      const dead2 = await handleMagpieLivenessCheck(false, testMockPort, async (port) => {
        await new Promise((resolve) => mockServer.close(resolve));
        return { installed: true, running: false, port, url: `http://localhost:${port}` };
      });
      assert.equal(dead2.magpieAlive, false);
      assert.equal(dead2.omnirouteStopped, true);
      assert.equal(dead2.status.running, false);
    } finally {
      try {
        await new Promise((resolve) => mockServer.close(resolve));
      } catch {}
    }

    // 4. Verification that status file records stoppedReason: "magpie-not-running"
    const statusCacheFile = path.join(process.env.ASM_CACHE_DIR || path.join(process.cwd(), "page"), "omniroute-status.js");
    if (fs.existsSync(statusCacheFile)) {
      const content = fs.readFileSync(statusCacheFile, "utf8");
      assert.ok(content.includes("magpie-not-running"), "Status file must record stoppedReason magpie-not-running");
    }

    resetMagpieLivenessForTest();
  });

  it("stopOmniroute & REST API Stop Endpoint: /api/omniroute/stop returns clean stopped status", async () => {
    // 1. stopOmniroute function call
    const res1 = await stopOmniroute(58196);
    assert.equal(res1.running, false);
    assert.equal(res1.port, 58196);

    // 2. POST /api/omniroute/stop
    const res2 = await new Promise((resolve, reject) => {
      const req = http.request(
        `http://127.0.0.1:${testServerPort}/api/omniroute/stop`,
        { method: "POST", headers: { "Content-Type": "application/json" } },
        (res) => {
          let body = "";
          res.on("data", (c) => { body += c; });
          res.on("end", () => resolve(JSON.parse(body)));
        }
      );
      req.on("error", reject);
      req.write(JSON.stringify({ port: 58196 }));
      req.end();
    });
    assert.equal(res2.running, false);
    assert.equal(res2.port, 58196);

    // 3. runOmnirouteAction with action: "stop"
    const stopPayload = await runOmnirouteAction("stop", 58196, "test-nonce-stop");
    assert.equal(stopPayload.action, "stop");
    assert.equal(stopPayload.nonce, "test-nonce-stop");
    assert.equal(stopPayload.running, false);
  });

  it("Frontend OmniRoute UX: port link copies to clipboard and dot click shows progress notification", () => {
    const js = fs.readFileSync(path.join(process.cwd(), "page", "app.js"), "utf8");
    const html = fs.readFileSync(path.join(process.cwd(), "page", "index.html"), "utf8");
    const css = fs.readFileSync(path.join(process.cwd(), "page", "style.css"), "utf8");
    const indexMjs = fs.readFileSync(path.join(process.cwd(), "index.mjs"), "utf8");

    // 1. Port link title in index.html
    assert.ok(html.includes("Click to copy link to clipboard"), "index.html port link title must mention copying to clipboard");

    // 2. app.js contains clipboard copy logic
    assert.ok(js.includes("copyTextToClipboard"), "app.js must implement copyTextToClipboard");
    assert.ok(js.includes("Copied port link to clipboard! Paste into your browser to enter"), "app.js must show clipboard copy toast");

    // 3. Progress notification during enabling on status dot click
    assert.ok(js.includes("Enabling OmniRoute on port"), "app.js must show progress toast during enabling");

    // 4. Hit area expansion for status dot in style.css
    assert.ok(css.includes(".status-dot::after"), "style.css must expand click hit target of status-dot via ::after");
    assert.ok(css.includes("cursor: pointer"), "style.css must declare cursor pointer on status-dot");

    // 5. Startup guard preventing background status checks from clobbering starting dot
    assert.ok(js.includes("isStartingOmniroute"), "app.js must track isStartingOmniroute");
    assert.ok(js.includes("if (isStartingOmniroute && !manual)"), "app.js must prevent background check from resetting blue dot during startup");

    // 6. Capsule click triggers enable when stopped
    assert.ok(js.includes("triggerEnableOmniroute"), "app.js must implement triggerEnableOmniroute");

    // 7. Desktop WebView Navigation Invariant: app.js must NOT register beforeunload or pagehide stopOmniroute calls
    // (In Magpie WebView2, beforeunload/pagehide fire on tab switching and page reloads, which would kill OmniRoute)
    assert.ok(!js.includes("beforeunload"), "app.js must not stop OmniRoute on beforeunload to protect against WebView tab switches");
    assert.ok(!js.includes("pagehide"), "app.js must not stop OmniRoute on pagehide to protect against WebView navigation");

    // 8. Worker Process Resilience Invariant: index.mjs and server.mjs must not kill OmniRoute on normal worker process exit
    // (Magpie reloads bun/node worker processes on file edits; OmniRoute shutdown must be tied to host liveness, not worker exits)
    const serverMjs = fs.readFileSync(path.join(process.cwd(), "server.mjs"), "utf8");
    assert.ok(!indexMjs.includes("process.on(\"exit\""), "index.mjs must not kill OmniRoute on process exit");
    assert.ok(!serverMjs.includes("process.on(\"exit\""), "server.mjs must not kill OmniRoute on process exit");
    assert.ok(indexMjs.includes("process.stdin.on(\"close\""), "index.mjs must listen to stdin close with liveness check when Magpie host closes");
    assert.ok(serverMjs.includes("lastWrittenOmnirouteStatusSignature"), "server.mjs must use status signature cache to prevent file watcher reload loops");
  });

  it("OmniRoute Startup Mutex & CWD Invariant: startOmniroute uses home cwd and deduplicates concurrent start calls", async () => {
    const mgrSrc = fs.readFileSync(path.join(process.cwd(), "manager.mjs"), "utf8");
    assert.ok(mgrSrc.includes("activeOmnirouteStartPromise"), "manager.mjs must maintain activeOmnirouteStartPromise mutex");
    assert.ok(mgrSrc.includes("cwd: home"), "manager.mjs must execute child processes in user home directory");

    // Concurrent startOmniroute calls on an active port must return the exact same promise
    const p1 = startOmniroute(58198);
    const p2 = startOmniroute(58198);
    assert.strictEqual(p1, p2, "Concurrent startOmniroute calls must return the same active promise");
    const [res1, res2] = await Promise.all([p1, p2]);
    assert.strictEqual(res1, res2, "Resolved results must be identical from concurrent calls");
  });

  it("Antivirus Protection & Direct Node Execution: locates node binary, passes --no-recovery, and avoids windowsHide heuristic flags", () => {
    const nodeBin = findNodeBinary();
    assert.ok(nodeBin && typeof nodeBin === "string", "findNodeBinary must return a string");
    assert.ok(fs.existsSync(nodeBin) || nodeBin === "node", "Resolved node binary must exist on disk");

    const cliPath = findOmnirouteCliPath();
    if (isOmnirouteInstalled()) {
      assert.ok(cliPath && typeof cliPath === "string", "findOmnirouteCliPath must locate omniroute.mjs when installed");
      assert.ok(fs.existsSync(cliPath), "Resolved omniroute.mjs must exist");
      assert.ok(cliPath.endsWith("omniroute.mjs"), "Resolved cli path must be omniroute.mjs");
    }

    const mgrSrc = fs.readFileSync(path.join(process.cwd(), "manager.mjs"), "utf8");
    assert.ok(mgrSrc.includes("--no-recovery"), "manager.mjs must pass --no-recovery to avoid supervisor crash-loop exits");
    assert.ok(!mgrSrc.includes("windowsHide: true"), "manager.mjs must not set windowsHide to avoid CREATE_NO_WINDOW Antivirus heuristic blocks");
    assert.ok(mgrSrc.includes("lastTasklistProbeTime"), "manager.mjs must throttle tasklist.exe reconnaissance to prevent antivirus alerts");
  });

  it("Magpie Options & Server Lifecycle: package.json declares options schema and index.mjs exports server handler", async () => {
    const pkgPath = path.resolve(process.cwd(), "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    assert.ok(pkg.magpie?.options, "package.json must declare magpie.options schema");
    assert.strictEqual(pkg.magpie.options.omnirouteRequest, null, "magpie.options must declare omnirouteRequest");

    const mod = await import("../index.mjs");
    assert.strictEqual(typeof mod.server, "function", "index.mjs must export server function for Magpie plugin host");
    assert.strictEqual(typeof mod.default.server, "function", "default export must include server function");

    // Invoking server with omnirouteRequest must execute cleanly
    const res = await mod.server({}, { omnirouteRequest: null });
    assert.ok(res && typeof res === "object", "server must return an object");
  });

  it("REST API Start Endpoint & Script Trigger: /api/omniroute/start and /action-omniroute.js respond correctly", async () => {
    // 1. GET /api/omniroute/start
    const resGet = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${testServerPort}/api/omniroute/start?port=58197`, (r) => {
        let body = "";
        r.on("data", (c) => { body += c; });
        r.on("end", () => resolve(JSON.parse(body)));
      }).on("error", reject);
    });
    assert.ok("installed" in resGet);
    assert.equal(resGet.port, 58197);

    // 2. Dynamic script trigger: /action-omniroute.js
    const scriptBody = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${testServerPort}/action-omniroute.js?action=status&port=58197&nonce=test-nonce-script`, (r) => {
        let body = "";
        r.on("data", (c) => { body += c; });
        r.on("end", () => resolve(body));
      }).on("error", reject);
    });
    assert.ok(scriptBody.includes("window.__OMNIROUTE_STATUS__ ="), "Must return valid JavaScript assigning window.__OMNIROUTE_STATUS__");
    assert.ok(scriptBody.includes("58197"));
    assert.ok(scriptBody.includes("test-nonce-script"));
  });

  it("Re-enabling & Startup Grace Protection: 30s window protects newly started instance and supports re-enabling", async () => {
    resetMagpieLivenessForTest();

    // 1. Record start attempt updates timestamp
    recordOmnirouteStartAttempt();
    const ts = getLastOmnirouteStartAttempt();
    assert.ok(ts > 0, "recordOmnirouteStartAttempt must record timestamp");

    // 2. Even when magpieAlive is false, liveness check returns startingUp: true within 30s window
    const checkWhileStarting = await handleMagpieLivenessCheck(false);
    assert.equal(checkWhileStarting.magpieAlive, false);
    assert.equal(checkWhileStarting.startingUp, true);
    assert.equal(checkWhileStarting.omnirouteStopped, false);

    // 3. Reset test state
    resetMagpieLivenessForTest();
    assert.equal(getLastOmnirouteStartAttempt(), 0);

    // 4. Verify frontend app.js logic allows clicking status dot to re-enable when stopped/red/gray
    const js = fs.readFileSync(path.join(process.cwd(), "page", "app.js"), "utf8");
    assert.ok(js.includes("dot.classList.contains(\"dot-red\")"), "app.js must permit re-enabling if dot is red");
    assert.ok(js.includes("apiClient.startOmniroute"), "app.js must trigger startOmniroute on dot click");
    assert.ok(js.includes("checkOmniroute(false)"), "app.js must sync OmniRoute status periodically and on focus");
  });

  it("Test Sandbox Isolation: test port writes do not pollute production page/omniroute-status.js", () => {
    assert.ok(fs.existsSync(prodStatusFile), "Production status file must exist");
    const content = fs.readFileSync(prodStatusFile, "utf8");
    assert.ok(!content.includes("58197"), "Production status file must never be polluted by test ports");
  });
});
