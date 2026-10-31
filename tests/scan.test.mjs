// tests/scan.test.mjs
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { makeSandbox } from "./helpers.mjs";

describe("Feature 1: Hub Component Discovery & Categories Registry", () => {
  test("scanPlugins discovers valid plugins, broken manifest fallback, and root skills while ignoring empty folders", async () => {
    const sb = makeSandbox();
    try {
      const m = await import("../manager.mjs");
      const plugins = m.scanPlugins(sb.hub);
      const ids = plugins.map((p) => p.id).sort();
      assert.deepEqual(ids, ["alpha-plugin", "beta-plugin", "broken-plugin", "workspace-skills"]);

      const alpha = plugins.find((p) => p.id === "alpha-plugin");
      assert.equal(alpha.name, "Alpha Suite");
      assert.equal(alpha.version, "1.2.0");
      assert.equal(alpha.hasMcp, true);
      assert.equal(alpha.hasHooks, true);
      assert.deepEqual(alpha.mcps.sort(), ["alpha-http", "alpha-mcp"]);
      assert.deepEqual(alpha.skills.sort(), ["code-review", "security-audit"]);
      assert.deepEqual(alpha.rules, ["alpha-style.md"]);
      assert.deepEqual(alpha.agents, ["reviewer.md"]);

      const broken = plugins.find((p) => p.id === "broken-plugin");
      assert.equal(broken.description, "Invalid plugin.json");
      assert.deepEqual(broken.skills, ["fallback-skill"]);
    } finally {
      sb.cleanup();
    }
  });

  test("scanPlugins returns [] for non-existent, misspelled, or empty paths without fallback", async () => {
    const sb = makeSandbox();
    try {
      const m = await import("../manager.mjs");
      assert.deepEqual(m.scanPlugins(path.join(sb.root, "does-not-exist")), []);
      assert.deepEqual(m.scanPlugins("D:\\Software\\AI Agnt Space_NonExistent_12345"), []);
      assert.deepEqual(m.scanPlugins(""), []);
      assert.deepEqual(m.scanPlugins(null), []);
    } finally {
      sb.cleanup();
    }
  });

  test("scanPlugins supports direct root-level plugin folders when plugins/ subfolder is absent", async () => {
    const sb = makeSandbox();
    try {
      const directHub = path.join(sb.root, "direct-hub");
      fs.mkdirSync(path.join(directHub, "solo-plugin", "skills", "s1"), { recursive: true });
      fs.writeFileSync(path.join(directHub, "solo-plugin", "plugin.json"), JSON.stringify({ name: "Solo" }), "utf8");
      const m = await import("../manager.mjs");
      const plugins = m.scanPlugins(directHub);
      assert.equal(plugins.length, 1);
      assert.equal(plugins[0].id, "solo-plugin");
    } finally {
      sb.cleanup();
    }
  });

  test("scanPlugins universally resolves quoted paths, single plugin dirs, and direct skills folders", async () => {
    const sb = makeSandbox();
    try {
      const m = await import("../manager.mjs");
      // 1. Quoted path input
      const quotedHub = `"${sb.hub}"`;
      const pluginsQuoted = m.scanPlugins(quotedHub);
      assert.equal(pluginsQuoted.length >= 3, true);

      // 2. Single plugin directory path
      const alphaPath = path.join(sb.hub, "plugins", "alpha-plugin");
      const alphaScan = m.scanPlugins(alphaPath);
      assert.equal(alphaScan.length, 1);
      assert.equal(alphaScan[0].id, "alpha-plugin");
      assert.equal(alphaScan[0].name, "Alpha Suite");

      // 3. Direct skills directory path
      const skillsPath = path.join(sb.hub, "skills");
      const skillsScan = m.scanPlugins(skillsPath);
      assert.equal(skillsScan.length, 1);
      assert.equal(skillsScan[0].id, "workspace-skills");
      assert.equal(skillsScan[0].skills.includes("standalone-skill"), true);
    } finally {
      sb.cleanup();
    }
  });

  test("buildCategoriesRegistry aggregates plugins, mcps, hooks, skills, agents, and rules including standalone root items", async () => {
    const sb = makeSandbox();
    try {
      const m = await import("../manager.mjs");
      const plugins = m.scanPlugins(sb.hub);
      const cats = m.buildCategoriesRegistry(plugins, sb.hub);
      assert.equal(cats.plugins.length, 4);
      assert.equal(cats.mcps.length, 3); // alpha-mcp, alpha-http, beta-db
      assert.equal(cats.hooks.length, 1);
      assert.equal(cats.skills.length, 5); // code-review, security-audit, deploy-helper, fallback-skill, standalone-skill
      assert.equal(cats.agents.length, 2); // reviewer.md + root-agent.md
      assert.equal(cats.rules.length, 3); // alpha-style.md, beta-ops.md + root-rule.md
    } finally {
      sb.cleanup();
    }
  });
});
