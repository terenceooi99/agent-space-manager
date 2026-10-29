// tests/sync-bundle.test.mjs
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { makeSandbox } from "./helpers.mjs";

describe("Feature 3 & 6: Antigravity Bundle Sync, Unlinking & Foreign Link Preservation", () => {
  test("syncIdePlugins links enabled plugins, unlinks disabled, and cleans all on empty/invalid hub", async () => {
    const sb = makeSandbox();
    try {
      const m = await import("../manager.mjs");
      const plugins = m.scanPlugins(sb.hub);
      const agyConfig = path.join(sb.home, ".gemini", "config", "plugins");
      const ide = {
        id: "antigravity",
        name: "Antigravity",
        agentType: "antigravity",
        configPath: agyConfig,
        enabled: true,
        plugins: { "alpha-plugin": true, "beta-plugin": false },
      };

      const res1 = m.syncIdePlugins(ide, plugins);
      assert.equal(res1.success, true);
      assert.equal(fs.existsSync(path.join(agyConfig, "alpha-plugin")), true);
      assert.equal(fs.existsSync(path.join(agyConfig, "beta-plugin")), false);

      // Flattened global skills, rules, and subagents are also synced into ~/.gemini/config/{skills,rules,agents}
      // so Antigravity's `/` slash menu and `@` mentions discover all enabled components (including root skills)
      const geminiSkillsDir = path.join(sb.home, ".gemini", "config", "skills");
      assert.equal(fs.existsSync(path.join(geminiSkillsDir, "code-review", "SKILL.md")), true);
      assert.equal(fs.existsSync(path.join(geminiSkillsDir, "standalone-skill", "SKILL.md")), true);
      assert.equal(fs.existsSync(path.join(geminiSkillsDir, "deploy-helper", "SKILL.md")), false);
      assert.equal(fs.existsSync(path.join(sb.home, ".gemini", "config", "rules", "alpha-style.md")), true);
      assert.equal(fs.existsSync(path.join(sb.home, ".gemini", "config", "agents", "reviewer.md")), true);

      // Setting path with 0 components unlinks all owned junctions and files
      const resEmpty = m.syncIdePlugins(ide, []);
      assert.equal(resEmpty.success, true);
      assert.equal(fs.existsSync(path.join(agyConfig, "alpha-plugin")), false);
      assert.equal(fs.existsSync(path.join(geminiSkillsDir, "code-review", "SKILL.md")), false);
      assert.equal(fs.existsSync(path.join(sb.home, ".gemini", "config", "agents", "reviewer.md")), false);
    } finally {
      sb.cleanup();
    }
  });

  test("syncIdePlugins preserves user-created foreign symlinks and non-hub skills.json entries", async () => {
    const sb = makeSandbox();
    try {
      const m = await import("../manager.mjs");
      const plugins = m.scanPlugins(sb.hub);
      const geminiCfg = path.join(sb.home, ".gemini", "config");
      const agyPlugins = path.join(geminiCfg, "plugins");
      fs.mkdirSync(agyPlugins, { recursive: true });

      // User manually linked a personal plugin outside the hub
      const externalPlugin = path.join(sb.root, "external-user-plugin");
      fs.mkdirSync(externalPlugin, { recursive: true });
      const foreignLink = path.join(agyPlugins, "my-foreign-link");
      m.createJunction(externalPlugin, foreignLink);

      // User has a custom entry in skills.json plus a stale hub entry
      const skillsJsonPath = path.join(geminiCfg, "skills.json");
      fs.writeFileSync(
        skillsJsonPath,
        JSON.stringify(
          {
            entries: [
              { name: "user-kept", path: path.join(sb.root, "custom-skill") },
              { name: "stale-hub", path: path.join(sb.hub, "plugins", "alpha-plugin", "skills", "code-review") },
            ],
          },
          null,
          2
        ),
        "utf8"
      );

      const ide = {
        id: "antigravity",
        name: "Antigravity",
        agentType: "antigravity",
        configPath: agyPlugins,
        enabled: true,
        plugins: {},
      };

      m.syncIdePlugins(ide, plugins);

      // Foreign symlink must NOT be deleted
      assert.equal(fs.lstatSync(foreignLink).isSymbolicLink(), true, "Foreign symlink must be preserved");

      // skills.json must preserve user-kept entry while stripping hub entry
      const afterJson = JSON.parse(fs.readFileSync(skillsJsonPath, "utf8"));
      assert.equal(afterJson.entries.some((e) => e.name === "user-kept"), true, "User entry in skills.json must survive");
      assert.equal(afterJson.entries.some((e) => e.name === "stale-hub"), false, "Stale hub entry in skills.json must be pruned");
    } finally {
      sb.cleanup();
    }
  });

  test("Antigravity bundle materializes real directories for Go os.ReadDir compatibility and unlinks 100% on removal", async () => {
    const sb = makeSandbox();
    try {
      const m = await import("../manager.mjs");
      const plugins = m.scanPlugins(sb.hub);
      const agyConfig = path.join(sb.home, ".gemini", "config", "plugins");
      const ide = {
        id: "antigravity",
        name: "Antigravity",
        agentType: "antigravity",
        configPath: agyConfig,
        enabled: true,
        plugins: { "alpha-plugin": true },
      };

      m.syncIdePlugins(ide, plugins);

      const alphaPluginDir = path.join(agyConfig, "alpha-plugin");
      const alphaStat = fs.lstatSync(alphaPluginDir);
      assert.equal(alphaStat.isDirectory(), true, "Must be a real directory so Go os.ReadDir sees IsDir() == true");
      assert.equal(alphaStat.isSymbolicLink(), false, "Must not be a top-level junction");
      assert.equal(fs.existsSync(path.join(alphaPluginDir, ".asm-owned.json")), true, "Must have .asm-owned marker");
      assert.equal(fs.existsSync(path.join(alphaPluginDir, "plugin.json")), true, "Must have real plugin.json");

      const flattenedSkillDir = path.join(sb.home, ".gemini", "config", "skills", "code-review");
      const skillStat = fs.lstatSync(flattenedSkillDir);
      assert.equal(skillStat.isDirectory(), true, "Flattened skill must be a real directory");
      assert.equal(skillStat.isSymbolicLink(), false, "Flattened skill must not be a top-level junction");
      assert.equal(fs.existsSync(path.join(flattenedSkillDir, "SKILL.md")), true, "Must have real SKILL.md");

      // Verify communication files written in hub
      m.syncAllIdes({ hubRoot: sb.hub, ides: [ide], projects: [] }, plugins);
      const bridgeFile = path.join(sb.hub, "agent-space-bridge.json");
      assert.equal(fs.existsSync(bridgeFile), true, "agent-space-bridge.json must exist in hub");
      const bridge = JSON.parse(fs.readFileSync(bridgeFile, "utf8"));
      assert.equal(bridge.activeAgents.length, 1);
      assert.equal(bridge.activeAgents[0].name, "Antigravity");

      const connectorsFile = path.join(sb.hub, "shared", "agent-connectors.json");
      assert.equal(fs.existsSync(connectorsFile), true, "shared/agent-connectors.json must exist");
      const connectors = JSON.parse(fs.readFileSync(connectorsFile, "utf8"));
      assert.ok(connectors.connectors["antigravity"]);
      assert.ok(fs.existsSync(connectors.connectors["antigravity"].handoffInbox));

      // Test complete unlinking when agent is removed
      m.unlinkAllForIde(ide);
      assert.equal(fs.existsSync(alphaPluginDir), false, "All plugin bundle folders must be completely removed");
      assert.equal(fs.existsSync(flattenedSkillDir), false, "All flattened skill folders must be completely removed");
      assert.equal(fs.existsSync(path.join(sb.home, ".gemini", "config", "rules", "alpha-style.md")), false);
      assert.equal(fs.existsSync(path.join(sb.home, ".gemini", "config", "agents", "reviewer.md")), false);
    } finally {
      sb.cleanup();
    }
  });

  test("Antigravity bundle mode with empty plugins (default disabled) links zero plugins", async () => {
    const sb = makeSandbox();
    try {
      const m = await import("../manager.mjs");
      const plugins = m.scanPlugins(sb.hub);
      const agyConfig = path.join(sb.home, ".gemini", "config", "plugins");
      const ide = {
        id: "antigravity",
        name: "Antigravity",
        agentType: "antigravity",
        configPath: agyConfig,
        enabled: true,
        plugins: {}, // Default unchecked / unselected
      };

      const res = m.syncIdePlugins(ide, plugins);
      assert.equal(res.success, true);
      assert.equal(fs.existsSync(path.join(agyConfig, "alpha-plugin")), false);
      assert.equal(fs.existsSync(path.join(agyConfig, "beta-plugin")), false);
    } finally {
      sb.cleanup();
    }
  });

  test("connectAgent replaces existing connection bridge rather than duplicating bridges (Requirement R3)", async () => {
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

      // 1. Initial Connection with alpha-plugin
      const conn1 = m.connectAgent(
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

      assert.equal(conn1.success, true);
      assert.equal(hubConfig.ides.length, 1);
      assert.equal(hubConfig.ides[0].id, "antigravity");
      assert.equal(fs.existsSync(path.join(agyConfig, "alpha-plugin")), true);
      assert.equal(fs.existsSync(path.join(agyConfig, "beta-plugin")), false);

      const bridgeFile = path.join(sb.hub, "agent-space-bridge.json");
      assert.equal(fs.existsSync(bridgeFile), true);
      const bridge1 = JSON.parse(fs.readFileSync(bridgeFile, "utf8"));
      assert.equal(bridge1.activeAgents.length, 1);
      assert.equal(bridge1.activeAgents[0].id, "antigravity");

      const connectorsFile = path.join(sb.hub, "shared", "agent-connectors.json");
      assert.equal(fs.existsSync(connectorsFile), true);
      const connMap1 = JSON.parse(fs.readFileSync(connectorsFile, "utf8"));
      assert.equal(Object.keys(connMap1.connectors).length, 1);
      assert.ok(connMap1.connectors["antigravity"]);

      // 2. Re-connect to the same agent with timestamped ID and different components (beta-plugin: true, alpha-plugin: false)
      const conn2 = m.connectAgent(
        hubConfig,
        {
          id: `antigravity-${Date.now()}`,
          name: "Antigravity Reconnected",
          agentType: "antigravity",
          configPath: agyConfig,
          plugins: { "alpha-plugin": false, "beta-plugin": true },
        },
        { effHub: sb.hub }
      );

      assert.equal(conn2.success, true);
      // In-place deduplication: exactly 1 IDE in config
      assert.equal(hubConfig.ides.length, 1);
      assert.equal(hubConfig.ides[0].id, "antigravity");

      // Differential sync: alpha unlinked, beta linked
      assert.equal(fs.existsSync(path.join(agyConfig, "alpha-plugin")), false);
      assert.equal(fs.existsSync(path.join(agyConfig, "beta-plugin")), true);

      // Single bridge replacement: exactly 1 entry in activeAgents and connectors
      const bridge2 = JSON.parse(fs.readFileSync(bridgeFile, "utf8"));
      assert.equal(bridge2.activeAgents.length, 1);
      assert.equal(bridge2.activeAgents[0].id, "antigravity");

      const connMap2 = JSON.parse(fs.readFileSync(connectorsFile, "utf8"));
      assert.equal(Object.keys(connMap2.connectors).length, 1);
      assert.ok(connMap2.connectors["antigravity"]);
    } finally {
      sb.cleanup();
    }
  });

  test("Magpie Host IPC api.connectAgent and decoupled api.saveConfig", async () => {
    const sb = makeSandbox();
    try {
      const { AgentSpaceManagerPlugin } = await import("../index.mjs");
      const agyConfig = path.join(sb.home, ".gemini", "config", "plugins");

      const hubConfig = {
        hubRoot: sb.hub,
        ides: [],
        projects: [],
      };

      // Save without sync flag does not trigger sync
      const saveRes = await AgentSpaceManagerPlugin.api.saveConfig(hubConfig);
      assert.equal(saveRes.success, true);
      assert.equal(saveRes.synced, false);
      assert.equal(saveRes.sync, undefined);

      // Save with explicit sync flag triggers sync
      const saveWithSync = await AgentSpaceManagerPlugin.api.saveConfig(hubConfig, { sync: true });
      assert.equal(saveWithSync.success, true);
      assert.equal(saveWithSync.synced, true);
      assert.ok(saveWithSync.sync);

      // Connect agent via IPC
      const connectRes = await AgentSpaceManagerPlugin.api.connectAgent(
        hubConfig,
        {
          id: "antigravity",
          agentType: "antigravity",
          configPath: agyConfig,
          plugins: { "alpha-plugin": true },
        },
        { effHub: sb.hub }
      );
      assert.equal(connectRes.success, true);
      assert.equal(fs.existsSync(path.join(agyConfig, "alpha-plugin")), true);
    } finally {
      sb.cleanup();
    }
  });

  test("REST API POST /api/connect connects agent and returns single bridge payload", async () => {
    const sb = makeSandbox();
    try {
      const { startApiServer } = await import("../server.mjs");
      const agyConfig = path.join(sb.home, ".gemini", "config", "plugins");
      const srv = startApiServer(0);
      await new Promise((resolve) => srv.once("listening", resolve));
      const port = srv.address().port;
      const base = `http://127.0.0.1:${port}`;

      try {
        const connectRes = await fetch(`${base}/api/connect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: "antigravity",
            agentType: "antigravity",
            configPath: agyConfig,
            plugins: { "alpha-plugin": true },
          }),
        }).then((r) => r.json());

        assert.equal(connectRes.success, true);
        assert.ok(connectRes.bridge);
        assert.ok(Array.isArray(connectRes.activeAgents));
        assert.equal(fs.existsSync(path.join(agyConfig, "alpha-plugin")), true);

        // Missing id/agentType returns 400
        const badRes = await fetch(`${base}/api/connect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        assert.equal(badRes.status, 400);
      } finally {
        await new Promise((resolve) => srv.close(resolve));
      }
    } finally {
      sb.cleanup();
    }
  });
});
