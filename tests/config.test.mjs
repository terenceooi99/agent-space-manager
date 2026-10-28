// tests/config.test.mjs
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { makeSandbox } from "./helpers.mjs";

describe("Feature 8: Hub Config Persistence, Effective Root & Migration", () => {
  test("getEffectiveHubRoot falls back to DEFAULT_HUB_ROOT when hubRoot is blank (never loops into 1st IDE configPath)", async () => {
    const sb = makeSandbox();
    try {
      const m = await import("../manager.mjs");
      const eff = m.getEffectiveHubRoot({
        hubRoot: "",
        ides: [{ id: "antigravity", configPath: path.join(sb.home, ".gemini", "config", "plugins") }],
      });
      assert.equal(eff, sb.hub);
    } finally {
      sb.cleanup();
    }
  });

  test("saveHubConfig writes UTF-8 without BOM and loadHubConfig migrates legacy IDE entries with agentType", async () => {
    const sb = makeSandbox();
    try {
      const m = await import("../manager.mjs");
      const cfgFile = path.join(sb.root, "custom-hub-config.json");
      const rawCfg = {
        hubRoot: sb.hub,
        ides: [
          {
            id: "antigravity",
            name: "Antigravity (Google Gemini)",
            configPath: path.join(sb.home, ".gemini", "config", "plugins"),
            enabled: true,
            plugins: {},
          },
        ],
        projects: [],
      };
      m.saveHubConfig(rawCfg, cfgFile);
      const bytes = fs.readFileSync(cfgFile);
      assert.notEqual(bytes[0], 0xef, "Must not write UTF-8 BOM");

      const loaded = m.loadHubConfig(cfgFile);
      assert.equal(loaded.ides[0].agentType, "antigravity");
    } finally {
      sb.cleanup();
    }
  });

  test("normalizeIdeEntry expands leading tilde (~) paths and normalizes ~/.gemini/config to plugins/", async () => {
    const sb = makeSandbox();
    try {
      const m = await import("../manager.mjs");
      const agy = m.normalizeIdeEntry({
        id: "antigravity",
        name: "Antigravity",
        configPath: "~/.gemini/config",
      });
      assert.equal(agy.configPath, path.join(sb.home, ".gemini", "config", "plugins"));

      const oc = m.normalizeIdeEntry({
        id: "opencode",
        name: "OpenCode",
        configPath: "~/.config/opencode/skills",
      });
      assert.equal(oc.configPath, path.join(sb.home, ".config", "opencode", "skills"));
    } finally {
      sb.cleanup();
    }
  });
});
