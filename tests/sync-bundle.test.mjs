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
        plugins: { "beta-plugin": false },
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
        plugins: {},
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
});
