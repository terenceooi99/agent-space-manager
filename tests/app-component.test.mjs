// tests/app-component.test.mjs
// Verification suite for App component discovery, categorization, IDE toggle/sync,
// workability status dots, upstream tracking, UI tags, and Copy Prompt V1.7.

process.env.ASM_TEST = "1";
process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { makeSandbox } from "./helpers.mjs";

test("App Component Suite: Discovery, Bridging, Toggle, Workability & UI", async (t) => {
  await t.test("scanPlugins and buildCategoriesRegistry discover standalone apps in <hub>/app/<name>", async () => {
    const sb = makeSandbox("test-app-scan-");
    try {
      const appDir = path.join(sb.hub, "app", "ms-playwright");
      fs.mkdirSync(path.join(appDir, "chromium-1243"), { recursive: true });
      fs.writeFileSync(
        path.join(appDir, "app.json"),
        JSON.stringify({
          id: "ms-playwright",
          name: "ms-playwright",
          version: "1.2.43",
          description: "Playwright browser binaries",
          upstream: "https://github.com/microsoft/playwright",
          env: { PLAYWRIGHT_BROWSERS_PATH: "." },
        }),
        "utf8"
      );

      const m = await import("../manager.mjs");
      const plugins = m.scanPlugins(sb.hub);
      const appComp = plugins.find((p) => p.id === "ms-playwright");
      assert.ok(appComp, "ms-playwright app must be discovered by scanPlugins");
      assert.equal(appComp.isApp, true);
      assert.equal(appComp.hasApp, true);
      assert.equal(appComp.componentType, "app");
      assert.equal(appComp.version, "1.2.43");
      assert.equal(appComp.upstream, "https://github.com/microsoft/playwright");
      assert.deepEqual(appComp.apps, ["ms-playwright"]);

      const cats = m.buildCategoriesRegistry(plugins, sb.hub);
      assert.equal(cats.apps.length, 1);
      assert.equal(cats.apps[0].name, "ms-playwright");
      assert.equal(cats.apps[0].sourcePath, appDir);

      const snap = m.getComponentsStorageSnapshot(sb.hub);
      assert.equal(snap.summary.appCount, 1);
      assert.ok(snap.rootComponents.apps["ms-playwright"]);

      const upstreams = m.collectAllComponentsUpstream(sb.hub);
      const upApp = upstreams.find((u) => u.id === "ms-playwright");
      assert.ok(upApp);
      assert.equal(upApp.type, "app");
      assert.equal(upApp.upstream, "https://github.com/microsoft/playwright");
    } finally {
      sb.cleanup();
    }
  });

  await t.test("syncIdePlugins toggles App ON/OFF for Antigravity and Claude Code without deleting source", async () => {
    const sb = makeSandbox("test-app-sync-");
    try {
      const appDir = path.join(sb.hub, "app", "ms-playwright");
      fs.mkdirSync(path.join(appDir, "chromium-1243"), { recursive: true });
      fs.writeFileSync(
        path.join(appDir, "app.json"),
        JSON.stringify({
          id: "ms-playwright",
          name: "ms-playwright",
          version: "1.2.43",
          upstream: "https://github.com/microsoft/playwright",
        }),
        "utf8"
      );

      const m = await import("../manager.mjs");
      const plugins = m.scanPlugins(sb.hub);
      const agyPluginsDir = path.join(sb.home, ".gemini", "config", "plugins");
      const agyAppsDir = path.join(sb.home, ".gemini", "config", "apps");

      // Preserve a user-owned folder in apps/
      const foreignDir = path.join(agyAppsDir, "user-custom-app");
      fs.mkdirSync(foreignDir, { recursive: true });
      fs.writeFileSync(path.join(foreignDir, "keep.txt"), "user-data", "utf8");

      const ideEnabled = {
        id: "antigravity",
        name: "Antigravity (Google)",
        agentType: "antigravity",
        configPath: agyPluginsDir,
        enabled: true,
        plugins: { "ms-playwright": true },
      };

      const resOn = m.syncIdePlugins(ideEnabled, plugins);
      assert.equal(resOn.success, true);
      assert.equal(resOn.summary.apps, 1);
      const linkedAppPath = path.join(agyAppsDir, "ms-playwright");
      assert.ok(fs.existsSync(linkedAppPath), "ms-playwright must be linked into ~/.gemini/config/apps/ms-playwright");
      assert.ok(fs.existsSync(path.join(linkedAppPath, "chromium-1243")), "linked app must expose runtime subdirectories");
      assert.equal(fs.existsSync(path.join(agyPluginsDir, "ms-playwright")), false, "app must NOT be materialized inside plugins/");

      // Workability status dot check when ON and linked
      const appComp = plugins.find((p) => p.id === "ms-playwright");
      const okDot = m.verifyPluginWorkabilityOnDisk(appComp, ideEnabled);
      assert.equal(okDot.workable, true);
      assert.equal(okDot.color, "green");
      assert.equal(okDot.verifiedOnDisk, true);

      // Bridge files check
      m.syncAllIdes({ hubRoot: sb.hub, ides: [ideEnabled], projects: [] }, plugins);
      const bridge = JSON.parse(fs.readFileSync(path.join(sb.hub, "agent-space-bridge.json"), "utf8"));
      assert.equal(bridge.componentCounts.apps, 1);
      const appsJson = JSON.parse(fs.readFileSync(path.join(sb.hub, "apps.json"), "utf8"));
      assert.equal(appsJson.apps.length, 1);
      assert.equal(appsJson.apps[0].id, "ms-playwright");

      // Toggle OFF for Antigravity
      const ideDisabled = { ...ideEnabled, plugins: { "ms-playwright": false } };
      const resOff = m.syncIdePlugins(ideDisabled, plugins);
      assert.equal(resOff.success, true);
      assert.equal(resOff.summary.apps, 0);
      assert.equal(fs.existsSync(linkedAppPath), false, "ms-playwright link must be removed when toggled OFF");
      assert.ok(fs.existsSync(path.join(appDir, "chromium-1243")), "source app in hub must NEVER be deleted on unlink");
      assert.ok(fs.existsSync(path.join(foreignDir, "keep.txt")), "user-owned folder in apps/ must be preserved");

      const offDot = m.verifyPluginWorkabilityOnDisk(appComp, ideDisabled);
      assert.equal(offDot.workable, false);
      assert.equal(offDot.color, "red");
      assert.equal(offDot.status, "disabled");

      // Convert mode agent (Claude Code) toggle ON/OFF
      const claudeIde = {
        id: "claude-code",
        name: "Claude Code",
        agentType: "claude-code",
        configPath: path.join(sb.home, ".claude", "skills"),
        enabled: true,
        plugins: { "ms-playwright": true },
      };
      const claudeRes = m.syncIdePlugins(claudeIde, plugins);
      assert.equal(claudeRes.success, true);
      assert.equal(claudeRes.summary.apps, 1);
      assert.ok(fs.existsSync(path.join(sb.home, ".claude", "apps", "ms-playwright")));
    } finally {
      sb.cleanup();
    }
  });

  await t.test("UI files expose App component count, category tab, App badge tag, and Copy Prompt V1.7", () => {
    const html = fs.readFileSync(path.resolve("page", "index.html"), "utf8");
    const css = fs.readFileSync(path.resolve("page", "style.css"), "utf8");
    const appJs = fs.readFileSync(path.resolve("page", "app.js"), "utf8");

    assert.ok(html.includes('id="cnt-apps"'), "index.html must include cnt-apps metric tile line");
    assert.ok(html.includes('data-cat="apps"') && html.includes('id="cat-cnt-apps"'), "index.html must include Apps category filter tab");
    assert.ok(html.includes('id="cpAppsInput"'), "index.html must include cpAppsInput custom path override");
    assert.ok(css.includes(".badge-app"), "style.css must style .badge-app");
    assert.ok(appJs.includes('badge-app">App</span>'), "app.js must render App tag in Components & Plugins list");
    assert.ok(appJs.includes('STORAGE_PROMPT_VERSION = "V1.7"'), "app.js must bump Copy Prompt to V1.7");
    assert.ok(appJs.includes("<Components Storage Path>/") && appJs.includes("app.json"), "Copy Prompt must describe app/ structure and app.json");
  });
});
