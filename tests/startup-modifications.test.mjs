// tests/startup-modifications.test.mjs
// Test suite for Components Storage Path modification checking and startup auto-reconnection.

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { makeSandbox } from "./helpers.mjs";
import {
  getComponentsStorageSnapshot,
  diffComponentsStorageSnapshots,
  checkComponentsModifications,
  checkAndAutoReconnectOnStartup,
  saveComponentsStorageSnapshot,
  loadComponentsStorageSnapshot,
  saveHubConfig,
} from "../manager.mjs";
import { AgentSpaceManagerPlugin } from "../index.mjs";

test("Feature 12: Components Storage Path Modification Tracking & Startup Auto-Reconnect", async (t) => {
  const sb = makeSandbox("asm-startup-mod-");

  await t.test("getComponentsStorageSnapshot computes deterministic fingerprint and canonical hash", () => {
    const snap1 = getComponentsStorageSnapshot(sb.hub);
    assert.equal(snap1.exists, true);
    assert.ok(snap1.hash && snap1.hash.length === 64, "Expected 64-char sha256 hash");
    assert.ok(snap1.summary.pluginCount >= 2, "Expected at least 2 plugins from sandbox fixture");
    assert.ok(snap1.summary.skillCount >= 3, "Expected skills to be indexed");

    // Second snapshot of unchanged hub produces identical hash
    const snap2 = getComponentsStorageSnapshot(sb.hub);
    assert.equal(snap2.hash, snap1.hash, "Snapshots of identical state must match hash");

    const diff = diffComponentsStorageSnapshots(snap1, snap2);
    assert.equal(diff.hasChanges, false);
    assert.match(diff.summary, /up to date|no changes/i);
  });

  await t.test("diffComponentsStorageSnapshots detects added, modified, and removed components", () => {
    const baseline = getComponentsStorageSnapshot(sb.hub);

    // 1. Detect added skill in existing plugin
    const newSkillDir = path.join(sb.hub, "plugins", "alpha-plugin", "skills", "dynamic-codegen");
    fs.mkdirSync(newSkillDir, { recursive: true });
    fs.writeFileSync(path.join(newSkillDir, "SKILL.md"), "# Dynamic Codegen\n", "utf8");

    const snapWithAddedSkill = getComponentsStorageSnapshot(sb.hub);
    const diffAdd = diffComponentsStorageSnapshots(baseline, snapWithAddedSkill);
    assert.equal(diffAdd.hasChanges, true);
    assert.ok(diffAdd.skillsAdded.some((s) => s.includes("dynamic-codegen")), "Expected dynamic-codegen in skillsAdded");
    assert.match(diffAdd.summary, /skill\(s\) added/i);

    // 2. Detect modified rule
    const ruleFile = path.join(sb.hub, "plugins", "alpha-plugin", "rules", "alpha-style.md");
    fs.appendFileSync(ruleFile, "\n// Updated rule content at " + Date.now(), "utf8");
    // Explicitly update mtime so filesystem timestamp differences are guaranteed
    const futureTime = new Date(Date.now() + 5000);
    fs.utimesSync(ruleFile, futureTime, futureTime);

    const snapWithModRule = getComponentsStorageSnapshot(sb.hub);
    const diffMod = diffComponentsStorageSnapshots(snapWithAddedSkill, snapWithModRule);
    assert.equal(diffMod.hasChanges, true);
    assert.ok(diffMod.rulesModified.length > 0 || diffMod.pluginsModified.length > 0);

    // 3. Detect removed skill
    fs.rmSync(newSkillDir, { recursive: true, force: true });
    const snapWithRemovedSkill = getComponentsStorageSnapshot(sb.hub);
    const diffRem = diffComponentsStorageSnapshots(snapWithModRule, snapWithRemovedSkill);
    assert.equal(diffRem.hasChanges, true);
    assert.ok(diffRem.skillsRemoved.some((s) => s.includes("dynamic-codegen")), "Expected dynamic-codegen in skillsRemoved");
  });

  await t.test("checkAndAutoReconnectOnStartup auto-reconnects connected agents on startup when changes exist", () => {
    // Setup a connected IDE (Claude Code format in sandboxed home)
    const claudeSkillsDir = path.join(sb.home, ".claude", "skills");
    const hubConfigFile = path.join(sb.hub, "hub-config.json");

    const testConfig = {
      hubRoot: sb.hub,
      ides: [
        {
          id: "claude-code",
          name: "Claude Code Test",
          agentType: "claude-code",
          configPath: claudeSkillsDir,
          enabled: true,
          plugins: { "alpha-plugin": true, "beta-plugin": true },
        },
      ],
      projects: [],
    };
    saveHubConfig(testConfig, hubConfigFile);

    // Run 1: Initial startup - baseline recorded and connected agents synced
    const startup1 = checkAndAutoReconnectOnStartup(testConfig);
    assert.equal(startup1.success, true);
    assert.equal(startup1.hasChanges, true);
    assert.equal(startup1.autoReconnected, true);
    assert.equal(startup1.connectedAgentsCount, 1);
    assert.ok(fs.existsSync(path.join(claudeSkillsDir, "code-review", "SKILL.md")), "code-review skill should be linked");
    assert.ok(fs.existsSync(path.join(claudeSkillsDir, "security-audit", "SKILL.md")), "security-audit skill should be linked");

    // Run 2: Second startup without modifications - no re-sync, clean in-sync status
    const startup2 = checkAndAutoReconnectOnStartup(testConfig);
    assert.equal(startup2.success, true);
    assert.equal(startup2.hasChanges, false);
    assert.equal(startup2.autoReconnected, false);
    assert.match(startup2.summary, /up to date|in sync/i);

    // Simulate external component addition while application was closed:
    // Add a new root skill to sb.hub/skills/
    const rootSkillDir = path.join(sb.hub, "skills", "hot-reload-skill");
    fs.mkdirSync(rootSkillDir, { recursive: true });
    fs.writeFileSync(path.join(rootSkillDir, "SKILL.md"), "---\nname: hot-reload-skill\n---\n# Hot Reload\n", "utf8");

    // Run 3: User opens/starts up application after adding hot-reload-skill
    const startup3 = checkAndAutoReconnectOnStartup(testConfig);
    assert.equal(startup3.success, true);
    assert.equal(startup3.hasChanges, true, "Startup must detect the new component difference");
    assert.equal(startup3.autoReconnected, true, "Startup must auto-reconnect connected agents");
    assert.ok(startup3.diff.skillsAdded.some((s) => s.includes("hot-reload-skill")));
    assert.ok(
      fs.existsSync(path.join(claudeSkillsDir, "hot-reload-skill", "SKILL.md")),
      "hot-reload-skill must be auto-linked into connected agent on startup"
    );

    // Run 4: Subsequent startup - state is cleanly updated
    const startup4 = checkAndAutoReconnectOnStartup(testConfig);
    assert.equal(startup4.success, true);
    assert.equal(startup4.hasChanges, false);
    assert.equal(startup4.autoReconnected, false);
  });

  await t.test("Magpie Host IPC exposes checkModifications and startupSync endpoints", async () => {
    assert.equal(typeof AgentSpaceManagerPlugin.api.checkModifications, "function");
    assert.equal(typeof AgentSpaceManagerPlugin.api.startupSync, "function");
    assert.equal(typeof AgentSpaceManagerPlugin.api.getComponentsSnapshot, "function");

    const checkRes = await AgentSpaceManagerPlugin.api.checkModifications(sb.hub);
    assert.equal(checkRes.hubRoot, sb.hub);
    assert.ok(checkRes.currentSnapshot);

    const snapshotRes = await AgentSpaceManagerPlugin.api.getComponentsSnapshot(sb.hub);
    assert.equal(snapshotRes.exists, true);
    assert.ok(snapshotRes.hash);
  });

  await t.test("REST API serves /api/check-modifications and /api/startup-sync", async () => {
    const { startApiServer } = await import("../server.mjs");
    const srv = startApiServer(0);
    await new Promise((resolve) => srv.once("listening", resolve));
    const port = srv.address().port;
    const base = `http://127.0.0.1:${port}`;

    try {
      // 1. GET /api/check-modifications
      const checkRes = await fetch(`${base}/api/check-modifications?path=${encodeURIComponent(sb.hub)}`).then((r) => r.json());
      assert.equal(checkRes.success, true);
      assert.equal(checkRes.hubRoot, sb.hub);
      assert.ok(checkRes.currentSnapshot);

      // 2. POST /api/startup-sync
      const syncRes = await fetch(`${base}/api/startup-sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hubRoot: sb.hub, ides: [] }),
      }).then((r) => r.json());

      assert.equal(syncRes.success, true);
      assert.equal(syncRes.startup, true);
    } finally {
      await new Promise((resolve) => srv.close(resolve));
    }
  });
});
