// tests/workability-status.test.mjs
// Test suite for component workability status dots (green/red) and @ and / quick-action detection.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  evaluateComponentAgentWorkability,
  verifyPluginWorkabilityOnDisk,
  recheckConnectedAgentsStatus,
  checkAndAutoReconnectOnStartup,
} from "../manager.mjs";
import { AgentSpaceManagerPlugin } from "../index.mjs";

test("Feature 13: Component Workability Status Dots & Quick Actions Detection", async (t) => {
  const samplePlugin = {
    id: "alpha-plugin",
    name: "Alpha Review Suite",
    description: "Thorough code review and security audits",
    skills: ["code-review", "security-audit"],
    agents: ["reviewer.md", "auditor.md"],
    rules: ["alpha-style.md"],
    hasMcp: true,
    mcps: ["alpha-mcp", "alpha-http"],
    hasHooks: true,
  };

  const activeIde = {
    id: "claude-code",
    name: "Claude Code",
    agentType: "claude-code",
    configPath: "C:\\Users\\test\\.claude\\skills",
    enabled: true,
    plugins: { "alpha-plugin": true },
  };

  await t.test("returns green dot when component is workable in connected agent with / and @ quick actions", () => {
    const res = evaluateComponentAgentWorkability(samplePlugin, activeIde);
    assert.equal(res.workable, true);
    assert.equal(res.color, "green");
    assert.equal(res.status, "workable");

    // Quick action verifications
    assert.equal(res.quickActions.hasSlash, true);
    assert.deepEqual(res.quickActions.slashCommands, ["/code-review", "/security-audit"]);

    assert.equal(res.quickActions.hasMention, true);
    assert.deepEqual(res.quickActions.mentions, ["@reviewer", "@auditor"]);

    assert.equal(res.quickActions.hasMcp, true);
    assert.equal(res.quickActions.hasRules, true);

    assert.match(res.summary, /Workable in Claude Code/);
    assert.match(res.tooltip, /🟢 Workable in Claude Code/);
    assert.match(res.tooltip, /Quick action: \/code-review \/security-audit/);
    assert.match(res.tooltip, /Quick action: @reviewer @auditor/);
  });

  await t.test("returns red dot when component is unselected/default-disabled (empty plugins map)", () => {
    const ideWithEmptyPlugins = {
      ...activeIde,
      plugins: {},
    };
    const res = evaluateComponentAgentWorkability(samplePlugin, ideWithEmptyPlugins);
    assert.equal(res.workable, false);
    assert.equal(res.color, "red");
    assert.equal(res.status, "disabled");
    assert.match(res.summary, /Disabled for Claude Code/);
  });

  await t.test("returns red dot when component is toggled off for the clicked connected agent", () => {
    const ideWithDisabled = {
      ...activeIde,
      plugins: { "alpha-plugin": false },
    };

    const res = evaluateComponentAgentWorkability(samplePlugin, ideWithDisabled);
    assert.equal(res.workable, false);
    assert.equal(res.color, "red");
    assert.equal(res.status, "disabled");
    assert.match(res.tooltip, /🔴 Connection failed \/ Disabled: Component is toggled OFF/);
  });

  await t.test("returns red dot when connected agent is disabled in settings", () => {
    const disabledIde = {
      ...activeIde,
      enabled: false,
    };

    const res = evaluateComponentAgentWorkability(samplePlugin, disabledIde);
    assert.equal(res.workable, false);
    assert.equal(res.color, "red");
    assert.equal(res.status, "disabled");
    assert.match(res.tooltip, /Agent "Claude Code" is disabled/);
  });

  await t.test("returns red dot when connected agent has no valid configuration path", () => {
    const missingPathIde = {
      ...activeIde,
      configPath: "",
      componentPaths: null,
    };

    const res = evaluateComponentAgentWorkability(samplePlugin, missingPathIde);
    assert.equal(res.workable, false);
    assert.equal(res.color, "red");
    assert.equal(res.status, "failed");
    assert.match(res.tooltip, /Target link path for "Claude Code" is not configured/);
  });

  await t.test("returns red dot when no connected agent is selected", () => {
    const res = evaluateComponentAgentWorkability(samplePlugin, null);
    assert.equal(res.workable, false);
    assert.equal(res.color, "red");
    assert.match(res.tooltip, /No connected agent selected/);
  });

  await t.test("returns red dot when sync reported an error for this connected agent", () => {
    const res = evaluateComponentAgentWorkability(samplePlugin, activeIde, {
      lastSync: { success: false, error: "Junction creation permission denied" },
    });

    assert.equal(res.workable, false);
    assert.equal(res.color, "red");
    assert.match(res.tooltip, /Junction creation permission denied/);
  });

  await t.test("Magpie Host IPC exposes evaluateWorkability method", () => {
    assert.equal(typeof AgentSpaceManagerPlugin.api.evaluateWorkability, "function");
    const ipcRes = AgentSpaceManagerPlugin.api.evaluateWorkability(samplePlugin, activeIde);
    assert.equal(ipcRes.workable, true);
    assert.equal(ipcRes.color, "green");
  });

  await t.test("strictly skips evaluation for component types not inside the plugin", () => {
    const skillsOnlyPlugin = {
      id: "skills-only",
      name: "Skills Only Plugin",
      skills: ["linter"],
      mcps: [],
      rules: [],
      agents: [],
      hasMcp: false,
      hasHooks: false,
    };
    const ide = {
      ...activeIde,
      plugins: { "skills-only": true },
    };
    const res = evaluateComponentAgentWorkability(skillsOnlyPlugin, ide);
    assert.equal(res.workable, true);
    assert.equal(res.features.skills.present, true);
    assert.equal(res.features.skills.workable, true);
    // Explicitly skipped: hooks, mcp, rules, agents are not in features
    assert.equal(res.features.mcp, undefined);
    assert.equal(res.features.hooks, undefined);
    assert.equal(res.features.rules, undefined);
    assert.equal(res.features.agents, undefined);
    // Tooltip contains only skills, not mentions of hooks/rules/mcps
    assert.match(res.tooltip, /✓ Skills \(1\): \/linter/);
    assert.doesNotMatch(res.tooltip, /Hooks/);
    assert.doesNotMatch(res.tooltip, /Rules/);
  });

  await t.test("evaluates partial compatibility and flags unsupported features while keeping workable", () => {
    const pluginWithHooks = {
      id: "multi-feature",
      name: "Multi Feature Plugin",
      skills: ["audit"],
      hasHooks: true,
      hooks: ["pre-tool-call"],
    };
    // Codex CLI has capabilities.hooks: false
    const codexIde = {
      id: "codex-cli",
      name: "Codex CLI",
      agentType: "codex",
      configPath: "C:\\Users\\test\\.codex\\skills",
      enabled: true,
      plugins: { "multi-feature": true },
    };
    const res = evaluateComponentAgentWorkability(pluginWithHooks, codexIde);
    assert.equal(res.workable, true);
    assert.equal(res.features.skills.workable, true);
    assert.equal(res.features.hooks.workable, false);
    assert.match(res.tooltip, /✓ Skills \(1\): \/audit/);
    assert.match(res.tooltip, /✗ Hooks \(1\): Skipped \(unsupported by Codex CLI\)/);
  });

  await t.test("verifyPluginWorkabilityOnDisk detects missing directory or files on disk", () => {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "asm-status-test-"));
    try {
      const skillsDir = path.join(tmpBase, ".claude", "skills");
      const ide = {
        id: "claude-code-test",
        name: "Claude Code Test",
        agentType: "claude-code",
        configPath: skillsDir,
        enabled: true,
        plugins: { "alpha-plugin": true },
      };

      // Case 1: Directory does not exist on disk
      const resMissingDir = verifyPluginWorkabilityOnDisk(samplePlugin, ide);
      assert.equal(resMissingDir.workable, false);
      assert.equal(resMissingDir.color, "red");
      assert.equal(resMissingDir.status, "missing_on_disk");
      assert.match(resMissingDir.tooltip, /Missing directory/i);

      // Case 2: Directory exists, but plugin skill files are missing
      fs.mkdirSync(skillsDir, { recursive: true });
      const resMissingFiles = verifyPluginWorkabilityOnDisk(samplePlugin, ide);
      assert.equal(resMissingFiles.workable, false);
      assert.equal(resMissingFiles.color, "red");
      assert.equal(resMissingFiles.status, "missing_on_disk");
      assert.match(resMissingFiles.tooltip, /Missing on disk/i);

      // Case 3: Skills exist on disk -> verified green dot
      fs.mkdirSync(path.join(skillsDir, "code-review"), { recursive: true });
      fs.mkdirSync(path.join(skillsDir, "security-audit"), { recursive: true });
      const resVerified = verifyPluginWorkabilityOnDisk(samplePlugin, ide);
      assert.equal(resVerified.workable, true);
      assert.equal(resVerified.color, "green");
      assert.equal(resVerified.status, "workable");
      assert.equal(resVerified.verifiedOnDisk, true);
    } finally {
      fs.rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  await t.test("recheckConnectedAgentsStatus audits each enabled plugin across all connected agents", () => {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "asm-audit-test-"));
    try {
      const claudeSkillsDir = path.join(tmpBase, ".claude", "skills");
      fs.mkdirSync(claudeSkillsDir, { recursive: true });

      const testConfig = {
        hubRoot: tmpBase,
        ides: [
          {
            id: "claude-test",
            name: "Claude Test",
            agentType: "claude-code",
            configPath: claudeSkillsDir,
            enabled: true,
            plugins: { "alpha-plugin": true },
          },
          {
            id: "disabled-test",
            name: "Disabled Agent",
            agentType: "codex",
            configPath: path.join(tmpBase, ".codex", "skills"),
            enabled: false,
            plugins: { "alpha-plugin": true },
          },
        ],
        projects: [],
      };

      const auditRes = recheckConnectedAgentsStatus(testConfig, [samplePlugin]);
      assert.equal(auditRes.success, true);
      assert.ok(auditRes.statusByIde["claude-test"]);
      assert.equal(auditRes.statusByIde["claude-test"]["alpha-plugin"].color, "red");
      assert.equal(auditRes.hasMissingComponents, true);

      // Now create skills on disk
      fs.mkdirSync(path.join(claudeSkillsDir, "code-review"), { recursive: true });
      fs.mkdirSync(path.join(claudeSkillsDir, "security-audit"), { recursive: true });

      const auditRes2 = recheckConnectedAgentsStatus(testConfig, [samplePlugin]);
      assert.equal(auditRes2.statusByIde["claude-test"]["alpha-plugin"].color, "green");
      assert.equal(auditRes2.hasMissingComponents, false);
    } finally {
      fs.rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  await t.test("Startup rechecks status dots after Magpie was closed or task-killed", () => {
    const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), "asm-killed-test-"));
    try {
      // Create hub with alpha plugin
      const hubPluginsDir = path.join(tmpBase, "plugins", "alpha-plugin", "skills", "code-review");
      fs.mkdirSync(hubPluginsDir, { recursive: true });
      fs.writeFileSync(path.join(hubPluginsDir, "SKILL.md"), "# Code Review\n", "utf8");

      const claudeSkillsDir = path.join(tmpBase, "claude-skills");
      fs.mkdirSync(claudeSkillsDir, { recursive: true });

      const testConfig = {
        hubRoot: tmpBase,
        ides: [
          {
            id: "claude-killed",
            name: "Claude Agent",
            agentType: "claude-code",
            configPath: claudeSkillsDir,
            enabled: true,
            plugins: { "alpha-plugin": true },
          },
        ],
        projects: [],
      };

      // 1. Initial startup syncs and verifies
      const start1 = checkAndAutoReconnectOnStartup(testConfig);
      assert.equal(start1.success, true);
      assert.ok(start1.statusByIde["claude-killed"]);
      assert.equal(start1.statusByIde["claude-killed"]["alpha-plugin"].color, "green");

      // 2. Simulate Magpie closed or task killed:
      // An external process deletes code-review from claude-skills while Magpie was closed!
      fs.rmSync(path.join(claudeSkillsDir, "code-review"), { recursive: true, force: true });

      // 3. User launches Magpie again -> startup detects missing component on disk and auto-heals
      const start2 = checkAndAutoReconnectOnStartup(testConfig);
      assert.equal(start2.success, true);
      assert.equal(start2.autoReconnected, true);
      assert.ok(fs.existsSync(path.join(claudeSkillsDir, "code-review", "SKILL.md")));
      assert.equal(start2.statusByIde["claude-killed"]["alpha-plugin"].color, "green");
    } finally {
      fs.rmSync(tmpBase, { recursive: true, force: true });
    }
  });

  await t.test("Magpie Host IPC exposes recheckStatus and verifyPluginWorkabilityOnDisk", async () => {
    assert.equal(typeof AgentSpaceManagerPlugin.api.recheckStatus, "function");
    assert.equal(typeof AgentSpaceManagerPlugin.api.verifyPluginWorkabilityOnDisk, "function");

    const recheckRes = await AgentSpaceManagerPlugin.api.recheckStatus({ ides: [] });
    assert.equal(recheckRes.success, true);
    assert.ok(recheckRes.statusByIde);
  });

  await t.test("Frontend UI contains dedicated progress window for in-flight status checking", () => {
    const htmlPath = path.resolve("page", "index.html");
    const html = fs.readFileSync(htmlPath, "utf8");

    assert.ok(html.includes('id="statusCheckingModal"'), "index.html must have statusCheckingModal element");
    assert.ok(html.includes('id="statusCheckingProgressBar"'), "must have progress bar");
    assert.ok(html.includes('id="statusCheckingStep"'), "must have step status text");
    assert.ok(html.includes('id="statusCheckingAgentList"'), "must have agent checking container");
    assert.ok(html.includes('id="btnBackgroundStatusCheck"'), "must provide non-blocking background option");
    assert.ok(html.includes('id="closeStatusCheckingModal"'), "must have close button");

    const jsPath = path.resolve("page", "app.js");
    const js = fs.readFileSync(jsPath, "utf8");
    assert.ok(js.includes("statusCheckingUI"), "app.js must implement statusCheckingUI progress controller");
  });
});
