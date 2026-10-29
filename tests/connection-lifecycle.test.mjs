// tests/connection-lifecycle.test.mjs
// Comprehensive test suite for Agent Space Manager Connection Flow & Lifecycle:
// Requirement R1: Manual Connection Trigger & UI Placement
// Requirement R2: Component Default State (Unchecked) & Preference Persistence
// Requirement R3: Single Connection Bridge Replacement & Duplicate Avoidance

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeSandbox } from "./helpers.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Requirement R1, R2, R3: Connection Lifecycle, Preference Persistence & Bridge Replacement", () => {
  // =========================================================================
  // REQUIREMENT R1: Manual Connection Trigger & UI Placement
  // =========================================================================

  test("R1: Decoupled saveHubConfig and /api/save persist hub configuration without generating active bridge or linking components", async () => {
    const sb = makeSandbox();
    try {
      const m = await import("../manager.mjs");
      const { startApiServer } = await import("../server.mjs");
      const agyConfig = path.join(sb.home, ".gemini", "config", "plugins");

      const hubConfig = {
        hubRoot: sb.hub,
        ides: [
          {
            id: "antigravity",
            name: "Antigravity",
            agentType: "antigravity",
            configPath: agyConfig,
            enabled: true,
            plugins: { "alpha-plugin": true },
          },
        ],
        projects: [],
      };

      // 1. Direct saveHubConfig call: writes hub-config.json only, no bridge, no links
      const customCfgPath = path.join(sb.root, "test-hub-config.json");
      m.saveHubConfig(hubConfig, customCfgPath);

      assert.equal(fs.existsSync(customCfgPath), true, "hub-config.json must be persisted");
      const saved = JSON.parse(fs.readFileSync(customCfgPath, "utf8"));
      assert.equal(saved.ides.length, 1);
      assert.equal(saved.ides[0].id, "antigravity");

      // Verify no active bridge file was created in hub root
      const bridgeFile = path.join(sb.hub, "agent-space-bridge.json");
      assert.equal(fs.existsSync(bridgeFile), false, "Saving config must NOT generate agent-space-bridge.json");

      // Verify no connector file was created
      const connFile = path.join(sb.hub, "shared", "agent-connectors.json");
      assert.equal(fs.existsSync(connFile), false, "Saving config must NOT generate agent-connectors.json");

      // Verify no physical links were created in target agent directory
      assert.equal(fs.existsSync(path.join(agyConfig, "alpha-plugin")), false, "No components should be linked on decoupled save");

      // 2. Decoupled REST API POST /api/save (without sync or connect flag)
      const srv = startApiServer(0);
      await new Promise((resolve) => srv.once("listening", resolve));
      const port = srv.address().port;
      const base = `http://127.0.0.1:${port}`;

      try {
        const saveRes = await fetch(`${base}/api/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            config: hubConfig,
            hubRoot: sb.hub,
          }),
        }).then((r) => r.json());

        assert.equal(saveRes.success, true);
        assert.equal(saveRes.synced, false, "Decoupled save must report synced: false");
        assert.equal(saveRes.sync, undefined, "Decoupled save must omit sync results");
        assert.equal(fs.existsSync(bridgeFile), false, "REST /api/save without connect flag must NOT write bridge file");
        assert.equal(fs.existsSync(path.join(agyConfig, "alpha-plugin")), false, "REST /api/save must NOT link components");

        // 3. Explicit sync flag on POST /api/save DOES perform sync
        const saveWithSync = await fetch(`${base}/api/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            config: hubConfig,
            sync: true,
          }),
        }).then((r) => r.json());

        assert.equal(saveWithSync.success, true);
        assert.equal(saveWithSync.synced, true);
        assert.ok(saveWithSync.sync);
        assert.equal(fs.existsSync(bridgeFile), true, "Explicit sync flag on save creates bridge file");
      } finally {
        await new Promise((resolve) => srv.close(resolve));
      }
    } finally {
      sb.cleanup();
    }
  });

  test("R1: Explicit connectAgent and POST /api/connect initiate connection, write bridge manifest, and link enabled components", async () => {
    const sb = makeSandbox();
    try {
      const m = await import("../manager.mjs");
      const { startApiServer } = await import("../server.mjs");
      const agyConfig = path.join(sb.home, ".gemini", "config", "plugins");

      const hubConfig = {
        hubRoot: sb.hub,
        ides: [],
        projects: [],
      };

      // 1. Core connectAgent invocation
      const connRes = m.connectAgent(
        hubConfig,
        {
          id: "antigravity",
          name: "Antigravity",
          agentType: "antigravity",
          configPath: agyConfig,
          plugins: { "alpha-plugin": true },
        },
        { effHub: sb.hub }
      );

      assert.equal(connRes.success, true);
      assert.ok(connRes.bridge, "connectAgent must return bridge manifest");
      assert.ok(Array.isArray(connRes.activeAgents), "connectAgent must return activeAgents list");
      assert.equal(connRes.activeAgents.length, 1);
      assert.equal(connRes.activeAgents[0].id, "antigravity");

      // Verify physical communication files on disk
      const bridgeFile = path.join(sb.hub, "agent-space-bridge.json");
      assert.equal(fs.existsSync(bridgeFile), true);
      const bridgeData = JSON.parse(fs.readFileSync(bridgeFile, "utf8"));
      assert.equal(bridgeData.activeAgents.length, 1);
      assert.equal(bridgeData.activeAgents[0].id, "antigravity");

      const connFile = path.join(sb.hub, "shared", "agent-connectors.json");
      assert.equal(fs.existsSync(connFile), true);
      const connData = JSON.parse(fs.readFileSync(connFile, "utf8"));
      assert.ok(connData.connectors["antigravity"]);

      // Verify components are linked
      assert.equal(fs.existsSync(path.join(agyConfig, "alpha-plugin")), true);

      // 2. REST API POST /api/connect invocation
      const srv = startApiServer(0);
      await new Promise((resolve) => srv.once("listening", resolve));
      const port = srv.address().port;
      const base = `http://127.0.0.1:${port}`;

      try {
        const apiRes = await fetch(`${base}/api/connect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: "antigravity",
            agentType: "antigravity",
            configPath: agyConfig,
            plugins: { "alpha-plugin": true, "beta-plugin": true },
          }),
        }).then((r) => r.json());

        assert.equal(apiRes.success, true);
        assert.ok(apiRes.bridge);
        assert.equal(apiRes.activeAgents.length, 1);
        assert.equal(fs.existsSync(path.join(agyConfig, "beta-plugin")), true);
      } finally {
        await new Promise((resolve) => srv.close(resolve));
      }
    } finally {
      sb.cleanup();
    }
  });

  test("R1: UI Placement - page/index.html contains dedicated #connectBtn directly adjacent to #rescanBtn", () => {
    const htmlPath = path.resolve(__dirname, "..", "page", "index.html");
    assert.equal(fs.existsSync(htmlPath), true, "page/index.html must exist");

    const htmlContent = fs.readFileSync(htmlPath, "utf8");

    // Check for #rescanBtn and #connectBtn
    assert.match(htmlContent, /id=["']rescanBtn["']/, "page/index.html must contain #rescanBtn");
    assert.match(htmlContent, /id=["']connectBtn["']/, "page/index.html must contain #connectBtn");

    // Verify adjacency: #connectBtn must appear in the same toolbar block directly following #rescanBtn
    const rescanIdx = htmlContent.indexOf('id="rescanBtn"');
    const connectIdx = htmlContent.indexOf('id="connectBtn"');
    assert.ok(rescanIdx > 0, "#rescanBtn position must be found");
    assert.ok(connectIdx > 0, "#connectBtn position must be found");
    assert.ok(connectIdx > rescanIdx, "#connectBtn must be placed to the right (after) #rescanBtn");

    // The gap between them should be within the same button container (<div style="display:flex; gap:8px;">)
    const snippetBetween = htmlContent.slice(rescanIdx, connectIdx);
    assert.ok(snippetBetween.length < 300, "#connectBtn must be directly adjacent to #rescanBtn");
    assert.match(htmlContent.slice(connectIdx, connectIdx + 120), /Connect/, "#connectBtn must have Connect text/label");
  });

  // =========================================================================
  // REQUIREMENT R2: Component Default State & Preference Persistence
  // =========================================================================

  test("R2: Components evaluate to disabled by default (empty plugins: {}) on clean startup or initial connection", async () => {
    const sb = makeSandbox();
    try {
      const m = await import("../manager.mjs");
      const adapters = await import("../adapters.mjs");
      const plugins = m.scanPlugins(sb.hub);
      assert.ok(plugins.length > 0, "Discovered hub plugins must not be empty");

      // 1. collectEnabledComponents with empty map returns 0 components
      const emptyEnabled = adapters.collectEnabledComponents(plugins, {});
      assert.equal(emptyEnabled.skills.length, 0, "No skills should be collected when plugins map is empty");
      assert.equal(Object.keys(emptyEnabled.mcpServers).length, 0, "No MCP servers should be collected");
      assert.equal(emptyEnabled.rules.length, 0, "No rules should be collected");
      assert.equal(emptyEnabled.agents.length, 0, "No agents should be collected");
      assert.equal(emptyEnabled.hooks.length, 0, "No hooks should be collected");

      // 2. collectEnabledComponents with undefined enabledMap also returns 0 components
      const undefinedEnabled = adapters.collectEnabledComponents(plugins, undefined);
      assert.equal(undefinedEnabled.skills.length, 0);
      assert.equal(Object.keys(undefinedEnabled.mcpServers).length, 0);

      // 3. syncIdePlugins for Antigravity with plugins: {} links 0 components
      const agyConfig = path.join(sb.home, ".gemini", "config", "plugins");
      const agyIde = {
        id: "antigravity",
        name: "Antigravity",
        agentType: "antigravity",
        configPath: agyConfig,
        enabled: true,
        plugins: {}, // Clean startup / unconfigured
      };
      const agySync = m.syncIdePlugins(agyIde, plugins);
      assert.equal(agySync.success, true);
      assert.equal(fs.existsSync(path.join(agyConfig, "alpha-plugin")), false);
      assert.equal(fs.existsSync(path.join(agyConfig, "beta-plugin")), false);

      // 4. syncIdePlugins for native adapter (Claude Code) with plugins: {} links 0 components
      const claudeSkills = path.join(sb.home, ".claude", "skills");
      const claudeIde = {
        id: "claude-code",
        name: "Claude Code",
        agentType: "claude-code",
        configPath: claudeSkills,
        enabled: true,
        plugins: {},
      };
      const claudeSync = m.syncIdePlugins(claudeIde, plugins);
      assert.equal(claudeSync.success, true);
      assert.equal(fs.existsSync(path.join(claudeSkills, "code-review")), false);
      assert.equal(fs.existsSync(path.join(claudeSkills, "deploy-helper")), false);

      // 5. evaluateComponentAgentWorkability returns workable: false, color: 'red' for unconfigured agent
      const samplePlugin = plugins.find((p) => p.id === "alpha-plugin") || plugins[0];
      const workability = m.evaluateComponentAgentWorkability(samplePlugin, agyIde);
      assert.equal(workability.workable, false, "Workability must be false when component is unselected");
      assert.equal(workability.color, "red", "Workability dot color must be red");
      assert.equal(workability.status, "disabled");
    } finally {
      sb.cleanup();
    }
  });

  test("R2: User component selections are persisted per agent and faithfully restored across reloads", async () => {
    const sb = makeSandbox();
    try {
      const m = await import("../manager.mjs");
      const cfgPath = path.join(sb.root, "persistent-hub-config.json");

      const initialConfig = {
        hubRoot: sb.hub,
        ides: [
          {
            id: "cursor",
            name: "Cursor AI",
            agentType: "cursor",
            configPath: path.join(sb.home, ".cursor", "rules"),
            enabled: true,
            plugins: {
              "alpha-plugin": true,
              "beta-plugin": false,
            },
          },
          {
            id: "antigravity",
            name: "Antigravity",
            agentType: "antigravity",
            configPath: path.join(sb.home, ".gemini", "config", "plugins"),
            enabled: true,
            plugins: {
              "alpha-plugin": false,
              "beta-plugin": true,
            },
          },
        ],
        projects: [],
      };

      // Persist config to disk
      m.saveHubConfig(initialConfig, cfgPath);

      // Reload config from disk
      const reloaded = m.loadHubConfig(cfgPath);
      assert.equal(reloaded.ides.length, 2);

      const cursorEntry = reloaded.ides.find((i) => i.id === "cursor");
      assert.ok(cursorEntry, "Cursor entry must be present");
      assert.equal(cursorEntry.plugins["alpha-plugin"], true, "Cursor alpha-plugin must be true");
      assert.equal(cursorEntry.plugins["beta-plugin"], false, "Cursor beta-plugin must be false");

      const agyEntry = reloaded.ides.find((i) => i.id === "antigravity");
      assert.ok(agyEntry, "Antigravity entry must be present");
      assert.equal(agyEntry.plugins["alpha-plugin"], false, "Antigravity alpha-plugin must be false");
      assert.equal(agyEntry.plugins["beta-plugin"], true, "Antigravity beta-plugin must be true");
    } finally {
      sb.cleanup();
    }
  });

  test("R2: Component preferences remain strictly isolated between distinct agents (no cross-agent pollution)", async () => {
    const sb = makeSandbox();
    try {
      const m = await import("../manager.mjs");
      const plugins = m.scanPlugins(sb.hub);

      const agyConfig = path.join(sb.home, ".gemini", "config", "plugins");
      const cursorConfig = path.join(sb.home, ".cursor", "rules");

      const hubConfig = {
        hubRoot: sb.hub,
        ides: [
          {
            id: "antigravity",
            name: "Antigravity",
            agentType: "antigravity",
            configPath: agyConfig,
            enabled: true,
            plugins: { "alpha-plugin": true, "beta-plugin": false },
          },
          {
            id: "cursor",
            name: "Cursor AI",
            agentType: "cursor",
            configPath: cursorConfig,
            enabled: true,
            plugins: { "alpha-plugin": false, "beta-plugin": true },
          },
        ],
        projects: [],
      };

      // 1. Connect Antigravity (should link only alpha-plugin)
      const agyTarget = hubConfig.ides[0];
      const resA = m.connectAgent(hubConfig, agyTarget, { effHub: sb.hub, customPlugins: plugins });
      assert.equal(resA.success, true);
      assert.equal(fs.existsSync(path.join(agyConfig, "alpha-plugin")), true, "Antigravity must have alpha-plugin");
      assert.equal(fs.existsSync(path.join(agyConfig, "beta-plugin")), false, "Antigravity must NOT have beta-plugin");

      // 2. Connect Cursor (should link only beta-plugin)
      const cursorTarget = hubConfig.ides[1];
      const resB = m.connectAgent(hubConfig, cursorTarget, { effHub: sb.hub, customPlugins: plugins });
      assert.equal(resB.success, true);

      // Verify Cursor rules directory: has beta-ops.mdc, does NOT have alpha-style.mdc
      assert.equal(fs.existsSync(path.join(cursorConfig, "beta-ops.mdc")), true, "Cursor must have beta-ops rule");
      assert.equal(fs.existsSync(path.join(cursorConfig, "alpha-style.mdc")), false, "Cursor must NOT have alpha-style rule");

      // Verify Antigravity was NOT altered by connecting Cursor
      assert.equal(fs.existsSync(path.join(agyConfig, "alpha-plugin")), true, "Antigravity must still have alpha-plugin");
      assert.equal(fs.existsSync(path.join(agyConfig, "beta-plugin")), false, "Antigravity must still NOT have beta-plugin");

      // Verify config object kept both distinct preferences without merging or overwriting
      const finalAgy = hubConfig.ides.find((i) => i.id === "antigravity");
      const finalCursor = hubConfig.ides.find((i) => i.id === "cursor");
      assert.equal(finalAgy.plugins["alpha-plugin"], true);
      assert.equal(finalAgy.plugins["beta-plugin"], false);
      assert.equal(finalCursor.plugins["alpha-plugin"], false);
      assert.equal(finalCursor.plugins["beta-plugin"], true);
    } finally {
      sb.cleanup();
    }
  });

  // =========================================================================
  // REQUIREMENT R3: Single Connection Bridge Replacement & Duplicate Avoidance
  // =========================================================================

  test("R3: Reconnecting the same agent with modified components replaces bridge entry and avoids duplicate IDEs", async () => {
    const sb = makeSandbox();
    try {
      const m = await import("../manager.mjs");
      const plugins = m.scanPlugins(sb.hub);
      const agyConfig = path.join(sb.home, ".gemini", "config", "plugins");

      const hubConfig = {
        hubRoot: sb.hub,
        ides: [],
        projects: [],
      };

      const bridgeFile = path.join(sb.hub, "agent-space-bridge.json");
      const connectorsFile = path.join(sb.hub, "shared", "agent-connectors.json");

      // Step 1: Initial connection with alpha-plugin
      const conn1 = m.connectAgent(
        hubConfig,
        {
          id: "antigravity",
          name: "Antigravity",
          agentType: "antigravity",
          configPath: agyConfig,
          plugins: { "alpha-plugin": true, "beta-plugin": false },
        },
        { effHub: sb.hub, customPlugins: plugins }
      );

      assert.equal(conn1.success, true);
      assert.equal(hubConfig.ides.length, 1);
      assert.equal(hubConfig.ides[0].id, "antigravity");
      assert.equal(fs.existsSync(path.join(agyConfig, "alpha-plugin")), true);
      assert.equal(fs.existsSync(path.join(agyConfig, "beta-plugin")), false);

      const bridge1 = JSON.parse(fs.readFileSync(bridgeFile, "utf8"));
      assert.equal(bridge1.activeAgents.length, 1);
      assert.equal(bridge1.activeAgents[0].id, "antigravity");

      const connectors1 = JSON.parse(fs.readFileSync(connectorsFile, "utf8"));
      assert.equal(Object.keys(connectors1.connectors).length, 1);
      assert.ok(connectors1.connectors["antigravity"]);

      // Step 2: Re-connect with a timestamped ID and swapped components (alpha disabled, beta enabled)
      const timestampedId = `antigravity-${Date.now()}`;
      const conn2 = m.connectAgent(
        hubConfig,
        {
          id: timestampedId,
          name: "Antigravity Reconnected",
          agentType: "antigravity",
          configPath: agyConfig,
          plugins: { "alpha-plugin": false, "beta-plugin": true },
        },
        { effHub: sb.hub, customPlugins: plugins }
      );

      assert.equal(conn2.success, true);

      // Verify in-place deduplication in hubConfig.ides
      assert.equal(hubConfig.ides.length, 1, "Must maintain exactly 1 IDE entry in hubConfig.ides");
      assert.equal(hubConfig.ides[0].id, "antigravity", "Must use canonical ID, stripping timestamp suffix");

      // Verify differential sync: alpha unlinked, beta linked
      assert.equal(fs.existsSync(path.join(agyConfig, "alpha-plugin")), false, "alpha-plugin must be unlinked");
      assert.equal(fs.existsSync(path.join(agyConfig, "beta-plugin")), true, "beta-plugin must be linked");

      // Verify bridge manifest has exactly 1 active agent
      const bridge2 = JSON.parse(fs.readFileSync(bridgeFile, "utf8"));
      assert.equal(bridge2.activeAgents.length, 1, "activeAgents must contain exactly 1 agent");
      assert.equal(bridge2.activeAgents[0].id, "antigravity");

      // Verify shared connectors registry has exactly 1 key
      const connectors2 = JSON.parse(fs.readFileSync(connectorsFile, "utf8"));
      assert.equal(Object.keys(connectors2.connectors).length, 1, "connectors map must contain exactly 1 entry");
      assert.ok(connectors2.connectors["antigravity"]);
    } finally {
      sb.cleanup();
    }
  });

  test("R3: Reconnecting native adapter replaces MCP servers and rule blocks without duplicates or syntax corruption", async () => {
    const sb = makeSandbox();
    try {
      const m = await import("../manager.mjs");
      const plugins = m.scanPlugins(sb.hub);

      const claudeSkills = path.join(sb.home, ".claude", "skills");
      const claudeJson = path.join(sb.home, ".claude.json");
      const claudeMd = path.join(sb.home, ".claude", "CLAUDE.md");
      const claudeAgents = path.join(sb.home, ".claude", "agents");

      // Pre-seed user custom MCP server in ~/.claude.json
      fs.writeFileSync(
        claudeJson,
        JSON.stringify({ mcpServers: { "user-dev-mcp": { command: "node", args: ["srv.js"] } } }, null, 2),
        "utf8"
      );

      const hubConfig = {
        hubRoot: sb.hub,
        ides: [],
        projects: [],
      };

      // 1. Initial Connection with alpha-plugin
      const conn1 = m.connectAgent(
        hubConfig,
        {
          id: "claude-code",
          name: "Claude Code",
          agentType: "claude-code",
          configPath: claudeSkills,
          plugins: { "alpha-plugin": true, "beta-plugin": false },
        },
        { effHub: sb.hub, customPlugins: plugins }
      );
      assert.equal(conn1.success, true);

      // Verify alpha components present
      assert.equal(fs.existsSync(path.join(claudeSkills, "code-review", "SKILL.md")), true);
      assert.equal(fs.existsSync(path.join(claudeSkills, "security-audit", "SKILL.md")), true);
      assert.equal(fs.existsSync(path.join(claudeAgents, "reviewer.md")), true);

      const parsedMcp1 = JSON.parse(fs.readFileSync(claudeJson, "utf8"));
      assert.ok(parsedMcp1.mcpServers["user-dev-mcp"], "Must preserve user custom MCP");
      assert.ok(parsedMcp1.mcpServers["alpha-mcp"], "Must have alpha-mcp");
      assert.equal(Boolean(parsedMcp1.mcpServers["beta-db"]), false, "Must not have beta-db yet");

      const rulesContent1 = fs.readFileSync(claudeMd, "utf8");
      assert.match(rulesContent1, /alpha-style\.md/);
      assert.doesNotMatch(rulesContent1, /beta-ops\.md/);

      // 2. Reconnect with beta-plugin only (replacing alpha)
      const conn2 = m.connectAgent(
        hubConfig,
        {
          id: "claude-code",
          name: "Claude Code",
          agentType: "claude-code",
          configPath: claudeSkills,
          plugins: { "alpha-plugin": false, "beta-plugin": true },
        },
        { effHub: sb.hub, customPlugins: plugins }
      );
      assert.equal(conn2.success, true);

      // Verify alpha skills unlinked, beta skills linked
      assert.equal(fs.existsSync(path.join(claudeSkills, "code-review", "SKILL.md")), false, "alpha skills must be unlinked");
      assert.equal(fs.existsSync(path.join(claudeSkills, "security-audit", "SKILL.md")), false);
      assert.equal(fs.existsSync(path.join(claudeSkills, "deploy-helper", "SKILL.md")), true, "beta skills must be linked");
      assert.equal(fs.existsSync(path.join(claudeAgents, "reviewer.md")), false, "alpha subagent must be unlinked");

      // Verify MCP servers in ~/.claude.json: user server preserved, alpha removed, beta added
      const parsedMcp2 = JSON.parse(fs.readFileSync(claudeJson, "utf8"));
      assert.ok(parsedMcp2.mcpServers["user-dev-mcp"], "Must retain user custom MCP");
      assert.equal(Boolean(parsedMcp2.mcpServers["alpha-mcp"]), false, "alpha-mcp must be removed");
      assert.ok(parsedMcp2.mcpServers["beta-db"], "beta-db must be added");

      // Verify CLAUDE.md: managed block replaced in place without duplicate delimiters
      const rulesContent2 = fs.readFileSync(claudeMd, "utf8");
      assert.match(rulesContent2, /beta-ops\.md/);
      assert.doesNotMatch(rulesContent2, /alpha-style\.md/);

      // Count occurrences of start and end delimiter markers
      const startMatches = rulesContent2.match(/<!-- agent-space-manager:start -->/g) || [];
      const endMatches = rulesContent2.match(/<!-- agent-space-manager:end -->/g) || [];
      assert.equal(startMatches.length, 1, "Must have exactly 1 start delimiter marker");
      assert.equal(endMatches.length, 1, "Must have exactly 1 end delimiter marker");
    } finally {
      sb.cleanup();
    }
  });

  test("R3: Consecutive rapid reconnections are idempotent and preserve single bridge invariant without resource leaks", async () => {
    const sb = makeSandbox();
    try {
      const m = await import("../manager.mjs");
      const plugins = m.scanPlugins(sb.hub);
      const agyConfig = path.join(sb.home, ".gemini", "config", "plugins");

      const hubConfig = {
        hubRoot: sb.hub,
        ides: [],
        projects: [],
      };

      const bridgeFile = path.join(sb.hub, "agent-space-bridge.json");
      const connectorsFile = path.join(sb.hub, "shared", "agent-connectors.json");

      // Perform 5 consecutive reconnect cycles alternating plugins
      for (let cycle = 1; cycle <= 5; cycle++) {
        const useAlpha = cycle % 2 !== 0;
        const res = m.connectAgent(
          hubConfig,
          {
            id: `antigravity-${Date.now() + cycle}`, // simulate repeated timestamped reconnects
            name: "Antigravity",
            agentType: "antigravity",
            configPath: agyConfig,
            plugins: {
              "alpha-plugin": useAlpha,
              "beta-plugin": !useAlpha,
            },
          },
          { effHub: sb.hub, customPlugins: plugins }
        );

        assert.equal(res.success, true);
        assert.equal(hubConfig.ides.length, 1, `Cycle ${cycle}: hubConfig.ides must contain exactly 1 entry`);
        assert.equal(hubConfig.ides[0].id, "antigravity", `Cycle ${cycle}: ID must remain canonical`);

        const bridge = JSON.parse(fs.readFileSync(bridgeFile, "utf8"));
        assert.equal(bridge.activeAgents.length, 1, `Cycle ${cycle}: activeAgents length must be 1`);
        assert.equal(bridge.activeAgents[0].id, "antigravity");

        const connMap = JSON.parse(fs.readFileSync(connectorsFile, "utf8"));
        assert.equal(Object.keys(connMap.connectors).length, 1, `Cycle ${cycle}: connectors keys count must be 1`);

        if (useAlpha) {
          assert.equal(fs.existsSync(path.join(agyConfig, "alpha-plugin")), true);
          assert.equal(fs.existsSync(path.join(agyConfig, "beta-plugin")), false);
        } else {
          assert.equal(fs.existsSync(path.join(agyConfig, "alpha-plugin")), false);
          assert.equal(fs.existsSync(path.join(agyConfig, "beta-plugin")), true);
        }
      }

      // Final integrity assertion: check that all entries in agyConfig point to valid targets
      const remainingEntries = fs.readdirSync(agyConfig);
      for (const ent of remainingEntries) {
        const fullPath = path.join(agyConfig, ent);
        assert.equal(fs.existsSync(fullPath), true, `Directory/file ${ent} must resolve to an existing location`);
      }
    } finally {
      sb.cleanup();
    }
  });

  test("R3 & Safety Invariants: Directory sanitization ensures zero 0-byte or empty {} stubs exist post-connection", async () => {
    const sb = makeSandbox();
    try {
      const m = await import("../manager.mjs");
      const plugins = m.scanPlugins(sb.hub);

      const agyConfigDir = path.join(sb.home, ".gemini", "config");
      const agyProjectsDir = path.join(agyConfigDir, "projects");
      const agyPluginsDir = path.join(agyConfigDir, "plugins");
      const ghostDir = path.join(agyPluginsDir, "ghost-empty-folder");

      fs.mkdirSync(agyProjectsDir, { recursive: true });
      fs.mkdirSync(ghostDir, { recursive: true });

      // Create corrupted stubs that break Language Servers
      const zeroByteFile = path.join(agyProjectsDir, "zero-byte-project.json");
      fs.writeFileSync(zeroByteFile, "", "utf8"); // 0-byte file

      const emptyStubFile = path.join(agyProjectsDir, "empty-stub-project.json");
      fs.writeFileSync(emptyStubFile, "{}", "utf8"); // Empty {} stub missing id

      const noIdFile = path.join(agyProjectsDir, "no-id-project.json");
      fs.writeFileSync(noIdFile, JSON.stringify({ name: "Broken" }), "utf8"); // Missing id

      const validProjectFile = path.join(agyProjectsDir, "valid-project.json");
      fs.writeFileSync(validProjectFile, JSON.stringify({ id: "valid-proj", name: "Valid Project" }), "utf8");

      const hubConfig = {
        hubRoot: sb.hub,
        ides: [],
        projects: [],
      };

      // Connect agent (which triggers directory sanitization pre- and post-sync)
      const res = m.connectAgent(
        hubConfig,
        {
          id: "antigravity",
          agentType: "antigravity",
          configPath: agyPluginsDir,
          plugins: { "alpha-plugin": true },
        },
        { effHub: sb.hub, customPlugins: plugins }
      );

      assert.equal(res.success, true);

      // Verify corrupted stubs were pruned
      assert.equal(fs.existsSync(zeroByteFile), false, "0-byte file must be pruned");
      assert.equal(fs.existsSync(emptyStubFile), false, "Empty {} stub must be pruned");
      assert.equal(fs.existsSync(noIdFile), false, "Manifest missing id must be pruned");
      assert.equal(fs.existsSync(ghostDir), false, "Empty ghost directory must be pruned");

      // Verify valid project manifest remains intact
      assert.equal(fs.existsSync(validProjectFile), true, "Valid project manifest must remain untouched");
    } finally {
      sb.cleanup();
    }
  });
});
