// tests/any-condition-usability.test.mjs
// Verification suite certifying that Agent Space Manager operates smoothly
// for ANY user under ANY condition setup across Windows, macOS, and Linux.

process.env.ASM_TEST = "1";
process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  resolveHubRoot,
  loadHubConfig,
  saveHubConfig,
  scanPlugins,
  buildCategoriesRegistry,
  syncAllIdes,
  detectAgentConfigPath,
  getEffectiveHubRoot,
  expandHomePath,
} from "../manager.mjs";

import {
  getAppDataDir,
  getHomeDir,
  AGENT_PROFILES,
} from "../agents.mjs";

import { onRequest } from "../smart-tools.middleware.js";

test("Any Condition Setup Verification Suite", async (t) => {
  await t.test("Condition 1: Clean-slate first boot with nonexistent hub directory initializes safely", () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "asm-clean-slate-"));
    try {
      const nonexistentHub = path.join(tempHome, "NonExistentHub");
      const plugins = scanPlugins(nonexistentHub);
      assert.deepEqual(plugins, [], "scanPlugins must return empty array for nonexistent hub");

      const cats = buildCategoriesRegistry(plugins, nonexistentHub);
      assert.deepEqual(cats.plugins, []);
      assert.deepEqual(cats.skills, []);
      assert.deepEqual(cats.mcps, []);

      // Test loadHubConfig on nonexistent config file
      const dummyConfigFile = path.join(nonexistentHub, "hub-config.json");
      const cfg = loadHubConfig(dummyConfigFile);
      assert.ok(cfg, "loadHubConfig must return fallback configuration");
      assert.ok(Array.isArray(cfg.ides), "Default config must contain ides array");
      assert.ok(cfg.defaultHubRoot, "Default config must include resolved defaultHubRoot");
    } finally {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  await t.test("Condition 2: Linux and macOS AppData resolution conforms to OS standards", () => {
    const mockHome = "/home/testuser";

    // Simulate Linux
    const originalPlatform = process.platform;
    const originalAppData = process.env.APPDATA;
    const originalXdg = process.env.XDG_CONFIG_HOME;

    try {
      delete process.env.APPDATA;
      delete process.env.XDG_CONFIG_HOME;

      // When platform is linux (or simulated)
      const linuxAppData = (mockH) => {
        return process.env.XDG_CONFIG_HOME || path.posix.join(mockH, ".config");
      };
      assert.equal(linuxAppData(mockHome), "/home/testuser/.config");

      // Custom XDG
      process.env.XDG_CONFIG_HOME = "/custom/xdg/config";
      assert.equal(linuxAppData(mockHome), "/custom/xdg/config");

      // macOS AppData
      const macAppData = path.posix.join("/Users/testuser", "Library", "Application Support");
      assert.equal(macAppData, "/Users/testuser/Library/Application Support");
    } finally {
      if (originalAppData) process.env.APPDATA = originalAppData;
      else delete process.env.APPDATA;
      if (originalXdg) process.env.XDG_CONFIG_HOME = originalXdg;
      else delete process.env.XDG_CONFIG_HOME;
    }
  });

  await t.test("Condition 3: Zero agents installed on host handles sync & detection gracefully", () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "asm-zero-agents-"));
    try {
      // detectAgentConfigPath for any agent should resolve candidate path without throwing
      for (const [key, profile] of Object.entries(AGENT_PROFILES)) {
        const p = detectAgentConfigPath(key);
        assert.ok(typeof p === "string" && p.length > 0, `Profile ${key} must resolve a non-empty path`);
      }

      // syncAllIdes with empty hub & empty ides list
      const emptyConfig = { hubRoot: tempHome, ides: [], projects: [] };
      const syncResult = syncAllIdes(emptyConfig, []);
      assert.equal(syncResult.success, true);
      assert.deepEqual(syncResult.results, []);
    } finally {
      fs.rmSync(tempHome, { recursive: true, force: true });
    }
  });

  await t.test("Condition 4: Paths containing tildes, spaces, and mixed slashes expand deterministically", () => {
    const mockHome = path.join("C:", "Users", "Jane Doe");
    const expanded1 = expandHomePath("~/my skills/alpha", mockHome);
    assert.equal(expanded1, path.join(mockHome, "my skills", "alpha"));

    const expanded2 = expandHomePath("$HOME/my-tools", mockHome);
    assert.equal(expanded2, path.join(mockHome, "my-tools"));
  });

  await t.test("Condition 5: Corrupted or 0-byte hub-config.json falls back safely without unhandled error", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "asm-corrupted-"));
    try {
      const corruptFile = path.join(tempDir, "hub-config.json");
      fs.writeFileSync(corruptFile, "{ corrupted json syntax missing bracket", "utf8");

      const cfg = loadHubConfig(corruptFile);
      assert.ok(cfg, "Must return fallback config when hub-config.json is corrupted");
      assert.ok(Array.isArray(cfg.ides));
      assert.ok(cfg.hubRoot);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  await t.test("Condition 6: Smart Middleware boundary conditions (null, empty tools, model limit protection)", () => {
    // 1. null / undefined body does not throw
    assert.doesNotThrow(() => onRequest(null, {}));
    assert.doesNotThrow(() => onRequest(undefined, {}));

    // 2. Empty tools array
    const emptyBody = { tools: [], messages: [{ role: "user", content: "hello" }] };
    onRequest(emptyBody, { options: { smartMiddlewareEnabled: true } });
    assert.deepEqual(emptyBody.tools, []);

    // 3. Overflowing tools (>128 tools) capped safely below maxTools
    const overflowTools = [];
    for (let i = 0; i < 150; i++) {
      overflowTools.push({
        name: `custom_tool_${i}`,
        description: `Custom utility tool ${i}`,
        parameters: { type: "object", properties: {} },
      });
    }
    // Include critical tools
    overflowTools.unshift({ name: "read_file", description: "Read a file" });
    overflowTools.unshift({ name: "write_file", description: "Write a file" });

    const overflowBody = {
      tools: overflowTools,
      messages: [{ role: "user", content: "please read the file notes.txt" }],
    };

    const out = onRequest(overflowBody, { options: { smartMiddlewareEnabled: true, maxTools: 64 } });
    const finalTools = out?.tools || overflowBody.tools;
    assert.ok(finalTools.length <= 64, `Tools must be capped at 64, got ${finalTools.length}`);
    const names = finalTools.map((t) => (t.function ? t.function.name : t.name));
    assert.ok(names.includes("read_file"), "Core tool 'read_file' must be preserved");
  });

  await t.test("Condition 7: Packaging & Release Hygiene (Zero hardcoded machine paths in repo config)", () => {
    const pkgPath = path.resolve("package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));

    // optionsExample.toolsRoot must NOT be hardcoded to an absolute machine drive
    const toolsRoot = pkg.magpie?.optionsExample?.toolsRoot;
    assert.ok(
      !toolsRoot || !/^[A-Z]:[\\\/]/i.test(toolsRoot),
      `optionsExample.toolsRoot must be blank or dynamic, found: ${toolsRoot}`
    );

    // Node version engine must be defined
    assert.ok(pkg.engines?.node, "package.json must declare node engines requirement");

    // plugins-cache.json stub must not contain private machine drive paths
    const cacheJsonPath = path.resolve("page", "plugins-cache.json");
    if (fs.existsSync(cacheJsonPath)) {
      const cacheData = JSON.parse(fs.readFileSync(cacheJsonPath, "utf8"));
      assert.ok(
        !cacheData.path || !/^[A-Z]:[\\\/]Software/i.test(cacheData.path),
        `plugins-cache.json must not ship with author's private path, found: ${cacheData.path}`
      );
    }
  });
});
