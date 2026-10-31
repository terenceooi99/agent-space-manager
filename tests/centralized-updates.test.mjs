// tests/centralized-updates.test.mjs
// Verification suite for Centralized Weekly Monday Upstream Update Checking,
// Removal of Decentralized Update Mechanisms, and Persistent Upstream Rules.

process.env.ASM_TEST = "1";
process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  getWeekMonday,
  isWeeklyMondayCheckDue,
  removeComponentUpdateMechanisms,
  extractComponentUpstream,
  collectAllComponentsUpstream,
  checkCentralizedUpstreamUpdates,
  loadCentralizedUpstreamUpdateState,
  checkAndAutoReconnectOnStartup,
} from "../manager.mjs";
import { makeSandbox } from "./helpers.mjs";

test("Centralized Weekly Monday Upstream Update Suite", async (t) => {
  await t.test("Date Math: getWeekMonday computes Monday 00:00:00 across all 7 days of the week", () => {
    // 2026-11-02 is Monday (Month 10 is November in 0-indexed JS Date)
    const monday = new Date(2026, 10, 2, 10, 30, 0);
    const mResult = getWeekMonday(monday);
    assert.equal(mResult.getFullYear(), 2026);
    assert.equal(mResult.getMonth(), 10);
    assert.equal(mResult.getDate(), 2);
    assert.equal(mResult.getHours(), 0);
    assert.equal(mResult.getMinutes(), 0);

    // 2026-11-04 is Wednesday (same week)
    const wednesday = new Date(2026, 10, 4, 15, 45, 0);
    const wResult = getWeekMonday(wednesday);
    assert.equal(wResult.getDate(), 2);

    // 2026-11-07 is Saturday (same week)
    const saturday = new Date(2026, 10, 7, 14, 0, 0);
    const satResult = getWeekMonday(saturday);
    assert.equal(satResult.getDate(), 2);

    // 2026-11-08 is Sunday (last day of the week starting Monday Nov 2)
    const sunday = new Date(2026, 10, 8, 12, 0, 0);
    const sunResult = getWeekMonday(sunday);
    assert.equal(sunResult.getDate(), 2);

    // 2026-11-09 is next Monday (new week begins)
    const nextMon = new Date(2026, 10, 9, 8, 0, 0);
    const nextResult = getWeekMonday(nextMon);
    assert.equal(nextResult.getDate(), 9);
  });

  await t.test("Schedule Logic: isWeeklyMondayCheckDue accurately triggers once per week on or after Monday", () => {
    // Condition 1: Never checked before -> Always due
    assert.equal(isWeeklyMondayCheckDue(null), true);
    assert.equal(isWeeklyMondayCheckDue(undefined), true);
    assert.equal(isWeeklyMondayCheckDue(""), true);

    // Condition 2: Checked last week -> Due on Monday startup
    const lastWeekCheck = new Date("2026-10-26T09:00:00.000Z").toISOString();
    const mondayStartup = new Date("2026-11-02T08:15:00.000Z");
    assert.equal(isWeeklyMondayCheckDue(lastWeekCheck, mondayStartup), true);

    // Condition 3: Checked this morning -> NOT due later on Monday
    const mondayMorningCheck = new Date("2026-11-02T08:15:00.000Z").toISOString();
    const mondayAfternoon = new Date("2026-11-02T14:30:00.000Z");
    assert.equal(isWeeklyMondayCheckDue(mondayMorningCheck, mondayAfternoon), false);

    // Condition 4: Checked on Monday -> NOT due on Wednesday/Friday
    const wednesday = new Date("2026-11-04T12:00:00.000Z");
    assert.equal(isWeeklyMondayCheckDue(mondayMorningCheck, wednesday), false);

    // Condition 5: First startup of the week occurs on Wednesday (user was away Monday/Tuesday) -> Due!
    assert.equal(isWeeklyMondayCheckDue(lastWeekCheck, wednesday), true);

    // Condition 6: Next Monday arrives -> Due again!
    const nextMonday = new Date("2026-11-09T09:00:00.000Z");
    assert.equal(isWeeklyMondayCheckDue(mondayMorningCheck, nextMonday), true);
  });

  await t.test("Mechanisms Removal: removeComponentUpdateMechanisms prunes decentralized update scripts", () => {
    const box = makeSandbox("test-clean-mechanisms-");
    const hub = box.hub;

    // Create dummy decentralized update checker files in various component subdirectories
    const pluginA = path.join(hub, "plugins", "tool-a");
    const sharedDir = path.join(hub, "shared", "tool-a");
    const skillDir = path.join(hub, "skills", "audit");
    fs.mkdirSync(pluginA, { recursive: true });
    fs.mkdirSync(sharedDir, { recursive: true });
    fs.mkdirSync(skillDir, { recursive: true });

    const file1 = path.join(pluginA, "update_checker.mjs");
    const file2 = path.join(sharedDir, "update_check_state.json");
    const file3 = path.join(skillDir, "update_check_state.json");
    const legitFile = path.join(pluginA, "plugin.json");

    fs.writeFileSync(file1, "console.log('legacy updater');", "utf8");
    fs.writeFileSync(file2, '{"last_check": 123}', "utf8");
    fs.writeFileSync(file3, '{"last_check": 456}', "utf8");
    fs.writeFileSync(legitFile, '{"name": "tool-a", "version": "1.0.0"}', "utf8");

    assert.ok(fs.existsSync(file1));
    assert.ok(fs.existsSync(file2));
    assert.ok(fs.existsSync(file3));

    const res = removeComponentUpdateMechanisms(hub);
    assert.equal(res.count, 3);
    assert.ok(!fs.existsSync(file1), "update_checker.mjs must be removed");
    assert.ok(!fs.existsSync(file2), "update_check_state.json must be removed");
    assert.ok(!fs.existsSync(file3), "skill update_check_state.json must be removed");
    assert.ok(fs.existsSync(legitFile), "Legitimate plugin.json must be preserved");

    // Calling again returns 0 removed
    const secondPass = removeComponentUpdateMechanisms(hub);
    assert.equal(secondPass.count, 0);
  });

  await t.test("Upstream Extraction: extractComponentUpstream extracts source links from all manifest types", () => {
    const box = makeSandbox("test-upstream-extract-");
    const hub = box.hub;

    // 1. plugin.json with upstream
    const p1 = path.join(hub, "plugins", "p1");
    fs.mkdirSync(p1, { recursive: true });
    fs.writeFileSync(path.join(p1, "plugin.json"), JSON.stringify({
      name: "p1",
      upstream: "https://github.com/fastcrw/crw",
    }), "utf8");
    const u1 = extractComponentUpstream(p1, "plugin", { upstream: "https://github.com/fastcrw/crw" });
    assert.equal(u1, "https://github.com/fastcrw/crw");

    // 2. plugin.json with repository string
    const u2 = extractComponentUpstream(p1, "plugin", { repository: "https://github.com/rtk-ai/rtk" });
    assert.equal(u2, "https://github.com/rtk-ai/rtk");

    // 3. plugin.json with repository object
    const u3 = extractComponentUpstream(p1, "plugin", { repository: { url: "https://github.com/headroomlabs-ai/headroom" } });
    assert.equal(u3, "https://github.com/headroomlabs-ai/headroom");

    // 4. Git clone with .git/config
    const pGit = path.join(hub, "plugins", "p-git");
    fs.mkdirSync(path.join(pGit, ".git"), { recursive: true });
    fs.writeFileSync(path.join(pGit, ".git", "config"), '[remote "origin"]\n\turl = https://github.com/DietrichGebert/ponytail.git\n', "utf8");
    const uGit = extractComponentUpstream(pGit, "plugin", {});
    assert.equal(uGit, "https://github.com/DietrichGebert/ponytail.git");

    // 5. SKILL.md with frontmatter upstream
    const skillDir = path.join(hub, "skills", "my-skill");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), "---\nname: my-skill\nupstream: https://github.com/miqdadbadjuber/anti-slop\n---\n# My Skill\n", "utf8");
    const uSkill = extractComponentUpstream(skillDir, "skill");
    assert.equal(uSkill, "https://github.com/miqdadbadjuber/anti-slop");
  });

  await t.test("Centralized Checking: checkCentralizedUpstreamUpdates executes and throttles weekly", () => {
    const box = makeSandbox("test-central-updates-");
    const hub = box.hub;

    // Create a plugin with upstream and a legacy update checker
    const myPlugin = path.join(hub, "plugins", "sample-plugin");
    fs.mkdirSync(myPlugin, { recursive: true });
    fs.writeFileSync(path.join(myPlugin, "plugin.json"), JSON.stringify({
      name: "sample-plugin",
      version: "1.0.0",
      upstream: "https://github.com/example/sample-plugin",
    }), "utf8");
    fs.writeFileSync(path.join(myPlugin, "update_checker.mjs"), "console.log('remove me');", "utf8");

    // Monday 09:00 startup
    const mondayNow = new Date("2026-11-02T09:00:00.000Z");
    const check1 = checkCentralizedUpstreamUpdates(hub, { now: mondayNow });

    assert.equal(check1.checked, true);
    assert.equal(check1.success, true);
    assert.ok(check1.trackedCount >= 1, "Must track at least 1 component upstream");
    assert.ok(!fs.existsSync(path.join(myPlugin, "update_checker.mjs")), "Must remove decentralized script");

    // Verify persisted state
    const savedState = loadCentralizedUpstreamUpdateState(hub);
    assert.ok(savedState);
    assert.equal(savedState.trackedCount, check1.trackedCount);

    // Later the same week (Wednesday) -> Skips because already checked this week!
    const wednesdayNow = new Date("2026-11-04T14:00:00.000Z");
    const check2 = checkCentralizedUpstreamUpdates(hub, { now: wednesdayNow });
    assert.equal(check2.checked, false);
    assert.equal(check2.reason, "already_checked_this_week");

    // Force option bypasses throttle
    const checkForced = checkCentralizedUpstreamUpdates(hub, { force: true, now: wednesdayNow });
    assert.equal(checkForced.checked, true);

    // Next Monday arrives -> Runs automatically on startup
    const nextMondayNow = new Date("2026-11-09T08:30:00.000Z");
    const checkNextMon = checkCentralizedUpstreamUpdates(hub, { now: nextMondayNow });
    assert.equal(checkNextMon.checked, true);
  });

  await t.test("Startup Integration: checkAndAutoReconnectOnStartup attaches centralUpdates", () => {
    const box = makeSandbox("test-startup-central-");
    const hub = box.hub;

    const dummyPlugin = path.join(hub, "plugins", "demo-tool");
    fs.mkdirSync(dummyPlugin, { recursive: true });
    fs.writeFileSync(path.join(dummyPlugin, "plugin.json"), JSON.stringify({
      name: "demo-tool",
      upstream: "https://github.com/demo/tool",
    }), "utf8");

    const customCfg = {
      hubRoot: hub,
      ides: [],
      projects: [],
    };

    const res = checkAndAutoReconnectOnStartup(customCfg, { now: new Date("2026-11-02T10:00:00.000Z") });
    assert.ok(res.success);
    assert.ok(res.centralUpdates, "Must include centralUpdates in startup response");
    assert.equal(res.centralUpdates.checked, true);
    assert.ok(res.centralUpdates.summary.includes("Weekly upstream check completed"));
  });

  await t.test("Copy Prompt Text: includes upstream links, centralized Monday check, persistent agent rule, and V1.0 version display", () => {
    const appJsPath = path.resolve("page", "app.js");
    const content = fs.readFileSync(appJsPath, "utf8");

    // 1. Must include upstream links instruction
    assert.ok(content.includes("Mandatory Upstream Links:"), "Must include Mandatory Upstream Links section");
    assert.ok(content.includes('"upstream": "https://github.com/<owner>/<repo>"'), "Must specify upstream format in plugin.json");
    assert.ok(content.includes('upstream: "https://github.com/<owner>/<repo>"'), "Must specify upstream in YAML frontmatter");

    // 2. Must include Centralized Weekly Update Checking instruction
    assert.ok(content.includes("Centralized Weekly Update Checking"), "Must include Centralized Weekly Update Checking section");
    assert.ok(content.includes("Monday whenever the user starts up Magpie"), "Must specify Monday startup check frequency");
    assert.ok(content.includes("Remove and DO NOT create individual, local, or decentralized update scripts"), "Must prohibit local updaters");

    // 3. Must include Mandatory Persistent Agent Rule instruction triggered on addendum or edit
    assert.ok(content.includes("Mandatory Persistent Agent Rule:"), "Must include Mandatory Persistent Agent Rule section");
    assert.ok(content.includes("ALWAYS TRIGGERED whenever an addendum, creation, modification, or edit is made to any component in the Components Storage Path"), "Must specify rule trigger on addendum or edit");

    // 4. Must declare and display V1.0 version
    assert.ok(content.includes('STORAGE_PROMPT_VERSION = "V1.0"'), "Must declare STORAGE_PROMPT_VERSION = 'V1.0'");
    assert.ok(content.includes("Prompt V1.0") || content.includes("${STORAGE_PROMPT_VERSION}"), "Prompt text must include V1.0 version");
    assert.ok(content.includes("Copy Prompt (${STORAGE_PROMPT_VERSION})"), "Button must show Copy Prompt (V1.0)");

    // 5. Index.html must display V1.0 on button
    const htmlPath = path.resolve("page", "index.html");
    const htmlContent = fs.readFileSync(htmlPath, "utf8");
    assert.ok(htmlContent.includes("Copy Prompt (V1.0)"), "index.html must display Copy Prompt (V1.0) on button");
  });

  await t.test("Persistent Rule File: .agents/rules/components-storage-upstream-rule.md conforms to safety invariants", () => {
    const rulePath = path.resolve(".agents", "rules", "components-storage-upstream-rule.md");
    assert.ok(fs.existsSync(rulePath), "components-storage-upstream-rule.md must exist");

    const content = fs.readFileSync(rulePath, "utf8");
    assert.ok(content.startsWith("---\n"), "Must start with YAML frontmatter at byte 0");
    assert.ok(content.includes("trigger: always_on"), "Must declare trigger: always_on for Cortex compatibility");
    assert.ok(content.includes("description:"), "Must declare clean description");
    assert.ok(content.includes("addendum"), "Must enforce trigger on component addendum");
    assert.ok(content.includes("Monday"), "Must reference centralized weekly Monday check");
  });

  await t.test("REST API: /api/central-update-check and /api/central-update-status respond correctly", async () => {
    const sb = makeSandbox("test-server-central-");
    const { startApiServer } = await import("../server.mjs");
    const srv = startApiServer(0);
    await new Promise((resolve) => srv.once("listening", resolve));
    const port = srv.address().port;
    const base = `http://127.0.0.1:${port}`;

    try {
      // 1. GET /api/central-update-check
      const getRes = await fetch(`${base}/api/central-update-check?path=${encodeURIComponent(sb.hub)}&force=true`).then((r) => r.json());
      assert.equal(getRes.success, true);
      assert.equal(getRes.checked, true);
      assert.ok(getRes.components);

      // 2. GET /api/central-update-status
      const statusRes = await fetch(`${base}/api/central-update-status?path=${encodeURIComponent(sb.hub)}`).then((r) => r.json());
      assert.equal(statusRes.success, true);
      assert.ok(statusRes.state);
      assert.equal(statusRes.state.hubRoot, sb.hub);

      // 3. POST /api/central-update-check
      const postRes = await fetch(`${base}/api/central-update-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hubRoot: sb.hub, force: true }),
      }).then((r) => r.json());
      assert.equal(postRes.success, true);
      assert.equal(postRes.checked, true);
    } finally {
      srv.close();
    }
  });
});
