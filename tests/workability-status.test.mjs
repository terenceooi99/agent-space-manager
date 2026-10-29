// tests/workability-status.test.mjs
// Test suite for component workability status dots (green/red) and @ and / quick-action detection.

import test from "node:test";
import assert from "node:assert/strict";
import { evaluateComponentAgentWorkability } from "../manager.mjs";
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
});
