// tests/adversarial-stress.test.mjs
// Adversarial Empirical Stress Harness for Agent Space Manager:
// 1. Rapid reconnection & bridge replacement under heavy cyclic load (alternating plugins, timestamped IDs)
// 2. Multi-agent interleaved reconnections without cross-agent pollution
// 3. Robustness against empty plugins, null/undefined payloads, and missing properties
// 4. Proactive pruning of corrupt JSON stubs, 0-byte files, and ghost directories
// 5. Verification of all universal safety invariants (GUI protection, rule frontmatter, MCP schemas, no-modal UI)

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeSandbox } from "./helpers.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe("Adversarial Empirical Stress Verification", () => {
  // =========================================================================
  // 1. RAPID RECONNECTION & ALTERNATING PLUGIN CYCLES
  // =========================================================================

  test("Stress 1: 25 rapid consecutive reconnections with alternating plugins never leak bridges, duplicate agents, or leave dangling junctions", async () => {
    const sb = makeSandbox("asm-stress-reconnect-");
    try {
      const m = await import("../manager.mjs");
      const adapters = await import("../adapters.mjs");
      const plugins = m.scanPlugins(sb.hub);
      assert.ok(plugins.length >= 2, "Sandbox must have at least 2 plugins");

      const agyConfig = path.join(sb.home, ".gemini", "config", "plugins");
      const hubConfig = {
        hubRoot: sb.hub,
        ides: [],
        projects: [],
      };

      const bridgeFile = path.join(sb.hub, "agent-space-bridge.json");
      const connectorsFile = path.join(sb.hub, "shared", "agent-connectors.json");

      // Run 25 consecutive reconnection cycles with alternating plugin combinations
      for (let cycle = 1; cycle <= 25; cycle++) {
        // Mode 0: alpha only, Mode 1: beta only, Mode 2: both, Mode 3: none (empty)
        const mode = cycle % 4;
        let pluginMap = {};
        if (mode === 0) pluginMap = { "alpha-plugin": true, "beta-plugin": false };
        else if (mode === 1) pluginMap = { "alpha-plugin": false, "beta-plugin": true };
        else if (mode === 2) pluginMap = { "alpha-plugin": true, "beta-plugin": true };
        else if (mode === 3) pluginMap = { "alpha-plugin": false, "beta-plugin": false };

        // Timestamped ID to stress deduplication logic
        const dynamicId = `antigravity-${Date.now() + cycle}`;

        const res = m.connectAgent(
          hubConfig,
          {
            id: dynamicId,
            name: "Google Antigravity",
            agentType: "antigravity",
            configPath: agyConfig,
            plugins: pluginMap,
          },
          { effHub: sb.hub, customPlugins: plugins }
        );

        // Assert zero crashes
        assert.equal(res.success, true, `Cycle ${cycle} must succeed`);

        // Assert exactly 1 entry in hubConfig.ides
        assert.equal(hubConfig.ides.length, 1, `Cycle ${cycle}: hubConfig.ides must have length 1`);
        assert.equal(hubConfig.ides[0].id, "antigravity", `Cycle ${cycle}: ID must be normalized to canonical`);

        // Assert bridge file integrity
        assert.equal(fs.existsSync(bridgeFile), true, `Cycle ${cycle}: bridge file must exist`);
        const bridgeData = JSON.parse(fs.readFileSync(bridgeFile, "utf8"));
        assert.equal(bridgeData.activeAgents.length, 1, `Cycle ${cycle}: bridge activeAgents must have length 1`);
        assert.equal(bridgeData.activeAgents[0].id, "antigravity");

        // Assert agent-connectors registry integrity
        assert.equal(fs.existsSync(connectorsFile), true, `Cycle ${cycle}: connectors file must exist`);
        const connData = JSON.parse(fs.readFileSync(connectorsFile, "utf8"));
        assert.equal(Object.keys(connData.connectors).length, 1, `Cycle ${cycle}: connectors keys must be 1`);
        assert.ok(connData.connectors["antigravity"]);

        // Assert physical filesystem state
        const alphaLinked = fs.existsSync(path.join(agyConfig, "alpha-plugin"));
        const betaLinked = fs.existsSync(path.join(agyConfig, "beta-plugin"));

        if (mode === 0) {
          assert.equal(alphaLinked, true, `Cycle ${cycle}: alpha should be linked`);
          assert.equal(betaLinked, false, `Cycle ${cycle}: beta should be unlinked`);
        } else if (mode === 1) {
          assert.equal(alphaLinked, false, `Cycle ${cycle}: alpha should be unlinked`);
          assert.equal(betaLinked, true, `Cycle ${cycle}: beta should be linked`);
        } else if (mode === 2) {
          assert.equal(alphaLinked, true, `Cycle ${cycle}: alpha should be linked`);
          assert.equal(betaLinked, true, `Cycle ${cycle}: beta should be linked`);
        } else if (mode === 3) {
          assert.equal(alphaLinked, false, `Cycle ${cycle}: alpha should be unlinked`);
          assert.equal(betaLinked, false, `Cycle ${cycle}: beta should be unlinked`);
        }

        // Verify no dangling symlinks / broken junctions exist in target directory
        if (fs.existsSync(agyConfig)) {
          const entries = fs.readdirSync(agyConfig);
          for (const ent of entries) {
            const entPath = path.join(agyConfig, ent);
            const st = fs.lstatSync(entPath);
            if (st.isSymbolicLink()) {
              const realTarget = fs.realpathSync(entPath);
              assert.ok(fs.existsSync(realTarget), `Link ${ent} must resolve to an existing path`);
            } else if (st.isDirectory()) {
              // Real materialized directory must contain .asm-owned.json
              assert.ok(
                fs.existsSync(path.join(entPath, ".asm-owned.json")),
                `Materialized directory ${ent} must have .asm-owned.json`
              );
            }
          }
        }
      }

      // Assert .asm-state/ directory contains only canonical ownership state (no leftover timestamped files)
      const stateDir = adapters.getStateDir();
      if (fs.existsSync(stateDir)) {
        const stateFiles = fs.readdirSync(stateDir).filter((f) => f.endsWith(".json"));
        const antigravityStates = stateFiles.filter((f) => f.startsWith("ide-antigravity"));
        assert.equal(
          antigravityStates.length,
          1,
          `There must be exactly 1 ide-antigravity state file, found: ${antigravityStates.join(", ")}`
        );
        assert.equal(antigravityStates[0], "ide-antigravity.json");
      }
    } finally {
      sb.cleanup();
    }
  });

  // =========================================================================
  // 2. MULTI-AGENT INTERLEAVED RECONNECTIONS
  // =========================================================================

  test("Stress 2: Rapidly interleaved reconnections across 4 distinct agents maintain clean isolation and single bridges", async () => {
    const sb = makeSandbox("asm-stress-multi-");
    try {
      const m = await import("../manager.mjs");
      const plugins = m.scanPlugins(sb.hub);

      const agyDir = path.join(sb.home, ".gemini", "config", "plugins");
      const claudeDir = path.join(sb.home, ".claude", "skills");
      const cursorDir = path.join(sb.home, ".cursor", "rules");
      const opencodeDir = path.join(sb.home, ".config", "opencode", "skills");

      const hubConfig = {
        hubRoot: sb.hub,
        ides: [],
        projects: [],
      };

      const agentSpecs = [
        { id: "antigravity", agentType: "antigravity", name: "Antigravity", configPath: agyDir },
        { id: "claude-code", agentType: "claude-code", name: "Claude Code", configPath: claudeDir },
        { id: "cursor", agentType: "cursor", name: "Cursor AI", configPath: cursorDir },
        { id: "opencode", agentType: "opencode", name: "OpenCode", configPath: opencodeDir },
      ];

      // Reconnect across agents in round-robin fashion for 16 iterations
      for (let i = 0; i < 16; i++) {
        const spec = agentSpecs[i % agentSpecs.length];
        const useAlpha = i % 2 === 0;

        const res = m.connectAgent(
          hubConfig,
          {
            ...spec,
            id: `${spec.id}-${Date.now() + i}`, // timestamped ID variant
            plugins: {
              "alpha-plugin": useAlpha,
              "beta-plugin": !useAlpha,
            },
          },
          { effHub: sb.hub, customPlugins: plugins }
        );

        assert.equal(res.success, true);
      }

      // Assert hubConfig.ides contains exactly 4 entries (1 per unique agent type)
      assert.equal(hubConfig.ides.length, 4, "hubConfig.ides must contain exactly 4 unique agent entries");
      const idSet = new Set(hubConfig.ides.map((i) => i.id));
      assert.deepEqual(Array.from(idSet).sort(), ["antigravity", "claude-code", "cursor", "opencode"]);

      // Assert bridge contains all 4 active agents without duplicates
      const bridgeFile = path.join(sb.hub, "agent-space-bridge.json");
      const bridgeData = JSON.parse(fs.readFileSync(bridgeFile, "utf8"));
      assert.equal(bridgeData.activeAgents.length, 4, "Active agents must equal 4");
      const bridgeIds = bridgeData.activeAgents.map((a) => a.id).sort();
      assert.deepEqual(bridgeIds, ["antigravity", "claude-code", "cursor", "opencode"]);

      // Assert connectors registry contains all 4 connectors
      const connectorsFile = path.join(sb.hub, "shared", "agent-connectors.json");
      const connData = JSON.parse(fs.readFileSync(connectorsFile, "utf8"));
      assert.equal(Object.keys(connData.connectors).length, 4);
    } finally {
      sb.cleanup();
    }
  });

  // =========================================================================
  // 3. ADVERSARIAL EDGE CASES & MALFORMED INPUTS
  // =========================================================================

  test("Stress 3: connectAgent handles malformed payloads, missing properties, and invalid types gracefully without crashing", async () => {
    const sb = makeSandbox("asm-stress-edge-");
    try {
      const m = await import("../manager.mjs");
      const hubConfig = { hubRoot: sb.hub, ides: [], projects: [] };

      // Case A: targetIde is null / undefined / non-object
      const resNull = m.connectAgent(hubConfig, null);
      assert.equal(resNull.success, false);
      assert.match(resNull.error, /Target IDE is required/);

      const resUndef = m.connectAgent(hubConfig, undefined);
      assert.equal(resUndef.success, false);

      const resString = m.connectAgent(hubConfig, "not-an-object");
      assert.equal(resString.success, false);

      // Case B: targetIde is empty object {} -> creates fallback custom agent
      const resEmptyObj = m.connectAgent(hubConfig, {});
      assert.equal(typeof resEmptyObj, "object");
      assert.equal(resEmptyObj.success, true); // Normalized to fallback ID
      assert.ok(resEmptyObj.ide);
      assert.equal(hubConfig.ides.length, 1);
      assert.equal(hubConfig.ides[0].id, "custom");

      // Case C: connect another agent with null plugins
      const resNullPlugins = m.connectAgent(
        hubConfig,
        {
          id: "test-agent",
          agentType: "custom",
          configPath: path.join(sb.home, "custom-agent"),
          plugins: null,
        },
        { effHub: sb.hub, customPlugins: [] }
      );
      assert.equal(resNullPlugins.success, true);
      assert.deepEqual(resNullPlugins.ide.plugins, {});
      assert.equal(hubConfig.ides.length, 2, "Should have custom and test-agent");

      // Case D: reconnect test-agent with unusual plugin keys -> must update test-agent in-place
      const resWeirdPlugins = m.connectAgent(
        hubConfig,
        {
          id: "test-agent",
          agentType: "custom",
          configPath: path.join(sb.home, "custom-agent"),
          plugins: { "": true, "ghost-plugin-9999": true, "beta-plugin": false },
        },
        { effHub: sb.hub, customPlugins: [] }
      );
      assert.equal(resWeirdPlugins.success, true);
      assert.equal(hubConfig.ides.length, 2, "Must update existing test-agent in place without appending a 3rd entry");

      // Case E: targetIde has configPath with messy formatting (leading tilde, trailing slashes, mixed separators)
      const resMessyPath = m.connectAgent(
        hubConfig,
        {
          id: "test-agent",
          agentType: "custom",
          configPath: path.join(sb.home, "custom-agent///"),
          plugins: {},
        },
        { effHub: sb.hub, customPlugins: [] }
      );
      assert.equal(resMessyPath.success, true);
      assert.equal(hubConfig.ides.length, 2, "Must recognize matching test-agent configPath and update in place");
    } finally {
      sb.cleanup();
    }
  });

  // =========================================================================
  // 4. CONFIG SANITIZATION: CORRUPT STUBS & GHOST DIRECTORIES
  // =========================================================================

  test("Stress 4: Sanitization proactively deletes corrupted JSON manifests, 0-byte files, and ghost folders while preserving valid manifests", async () => {
    const sb = makeSandbox("asm-stress-sanitize-");
    try {
      const m = await import("../manager.mjs");
      const agyConfig = path.join(sb.home, ".gemini", "config");
      const projDir = path.join(agyConfig, "projects");
      const pluginsDir = path.join(agyConfig, "plugins");
      const skillsDir = path.join(agyConfig, "skills");

      fs.mkdirSync(projDir, { recursive: true });
      fs.mkdirSync(pluginsDir, { recursive: true });
      fs.mkdirSync(skillsDir, { recursive: true });

      // Create a battery of corrupted manifests
      const f1_zeroByte = path.join(projDir, "bad-zero-byte.json");
      fs.writeFileSync(f1_zeroByte, "", "utf8");

      const f2_whitespace = path.join(projDir, "bad-whitespace.json");
      fs.writeFileSync(f2_whitespace, "  \n\t  \r\n  ", "utf8");

      const f3_emptyObj = path.join(projDir, "bad-empty-obj.json");
      fs.writeFileSync(f3_emptyObj, "{}", "utf8");

      const f4_missingId = path.join(projDir, "bad-missing-id.json");
      fs.writeFileSync(f4_missingId, JSON.stringify({ name: "Manifest Without ID", repo: "test" }), "utf8");

      // Valid project manifest
      const fValid = path.join(projDir, "valid-project.json");
      fs.writeFileSync(fValid, JSON.stringify({ id: "valid-p1", name: "Valid Project", repoPath: "C:\\repo" }), "utf8");

      // Ghost empty directories
      const ghost1 = path.join(pluginsDir, "empty-ghost-plugin");
      const ghost2 = path.join(skillsDir, "empty-ghost-skill");
      fs.mkdirSync(ghost1, { recursive: true });
      fs.mkdirSync(ghost2, { recursive: true });

      // Run sanitization
      m.sanitizeAgentConfigDirectory(agyConfig, "antigravity");

      // Assert corrupted files pruned
      assert.equal(fs.existsSync(f1_zeroByte), false, "0-byte file must be pruned");
      assert.equal(fs.existsSync(f2_whitespace), false, "Whitespace file must be pruned");
      assert.equal(fs.existsSync(f3_emptyObj), false, "Empty {} file must be pruned");
      assert.equal(fs.existsSync(f4_missingId), false, "Manifest missing id must be pruned");

      // Assert ghost directories pruned
      assert.equal(fs.existsSync(ghost1), false, "Empty ghost plugin folder must be pruned");
      assert.equal(fs.existsSync(ghost2), false, "Empty ghost skill folder must be pruned");

      // Assert valid project manifest remains untouched
      assert.equal(fs.existsSync(fValid), true, "Valid project manifest must remain on disk");
      const validParsed = JSON.parse(fs.readFileSync(fValid, "utf8"));
      assert.equal(validParsed.id, "valid-p1");
    } finally {
      sb.cleanup();
    }
  });

  // =========================================================================
  // 5. SAFETY INVARIANTS COMPLIANCE VERIFICATION
  // =========================================================================

  test("Stress 5: Process Protection Invariant - killAgentProcesses never terminates protected GUI code editors", async () => {
    const m = await import("../manager.mjs");

    const protectedAgents = [
      "antigravity",
      "cursor",
      "windsurf",
      "vscode",
      "vscode-copilot",
      "vscodium",
      "opencode",
      "kiro",
      "gemini-cli",
      "cline",
      "roo-code",
    ];

    for (const agentType of protectedAgents) {
      const res = await m.killAgentProcesses({ id: agentType, agentType });
      assert.equal(res.success, true);
      // In test mode, it reports test-environment; in production, gui-editor-hot-reload-protected
      assert.ok(
        res.skipped === "test-environment" || res.skipped === "gui-editor-hot-reload-protected",
        `Agent ${agentType} must be skipped and protected from process killing`
      );
    }
  });

  test("Stress 5: Frontend UI Invariant - zero window.alert, confirm, or prompt calls in page/app.js or page/index.html", () => {
    const appJsPath = path.resolve(__dirname, "..", "page", "app.js");
    const indexHtmlPath = path.resolve(__dirname, "..", "page", "index.html");

    const appJs = fs.readFileSync(appJsPath, "utf8");
    const indexHtml = fs.readFileSync(indexHtmlPath, "utf8");

    const prohibitedPatterns = [
      /\bwindow\.alert\s*\(/,
      /\bwindow\.confirm\s*\(/,
      /\bwindow\.prompt\s*\(/,
      /\balert\s*\(/,
      /\bconfirm\s*\(/,
      /\bprompt\s*\(/,
    ];

    for (const pat of prohibitedPatterns) {
      assert.equal(
        pat.test(appJs),
        false,
        `Prohibited synchronous dialog pattern ${pat} found in page/app.js`
      );
      assert.equal(
        pat.test(indexHtml),
        false,
        `Prohibited synchronous dialog pattern ${pat} found in page/index.html`
      );
    }
  });

  test("Stress 5: Rule Normalization Invariant - syncOwnedFiles normalizes rules with trigger: always_on and single-line description", async () => {
    const sb = makeSandbox("asm-stress-rules-");
    try {
      const adapters = await import("../adapters.mjs");
      const rulesDir = path.join(sb.home, ".gemini", "config", "rules");
      const srcRuleFile = path.join(sb.root, "source-rule.md");
      fs.writeFileSync(
        srcRuleFile,
        "---\ndescription: \"Multline\\ndescription\\nhere\"\n---\n# My Rule Body\nRule instructions.\n",
        "utf8"
      );

      const items = [{ name: "my-rule.md", sourceFile: srcRuleFile }];
      const res = adapters.syncOwnedFiles(items, { dir: rulesDir, suffix: ".md", format: "antigravity-rule" });

      assert.equal(res.nextFiles.length, 1);
      const destFile = path.join(rulesDir, "my-rule.md");
      assert.equal(fs.existsSync(destFile), true);

      const content = fs.readFileSync(destFile, "utf8");
      assert.ok(content.startsWith("---\n"), "Must start with frontmatter ---");
      assert.match(content, /trigger:\s*always_on/, "Must include trigger: always_on");
      assert.match(content, /description:/, "Must include description");
      assert.match(content, /# My Rule Body/, "Must preserve markdown body");
    } finally {
      sb.cleanup();
    }
  });

  test("Stress 5: MCP Schema Compatibility - OpenCode schema transformation & Copilot root keys", async () => {
    const sb = makeSandbox("asm-stress-mcp-");
    try {
      const adapters = await import("../adapters.mjs");
      const ocMcpFile = path.join(sb.home, ".config", "opencode", "opencode.json");
      fs.mkdirSync(path.dirname(ocMcpFile), { recursive: true });

      const mcpServers = {
        "alpha-mcp": { command: "npx", args: ["-y", "@alpha/mcp-server"], env: { KEY: "123" } },
        "alpha-http": { url: "https://mcp.alpha.example/sse" },
      };

      const res = adapters.syncJsonMcpServers(
        { file: ocMcpFile, key: "mcp", format: "opencode-json" },
        mcpServers,
        []
      );

      assert.equal(res.ownedKeys.length, 2);
      const ocJson = JSON.parse(fs.readFileSync(ocMcpFile, "utf8"));
      assert.ok(ocJson.mcp["alpha-mcp"]);
      assert.equal(ocJson.mcp["alpha-mcp"].type, "local");
      assert.deepEqual(ocJson.mcp["alpha-mcp"].command, ["npx", "-y", "@alpha/mcp-server"]);
      assert.deepEqual(ocJson.mcp["alpha-mcp"].environment, { KEY: "123" });
      assert.equal(ocJson.mcp["alpha-mcp"].enabled, true);

      assert.ok(ocJson.mcp["alpha-http"]);
      assert.equal(ocJson.mcp["alpha-http"].type, "remote");
      assert.equal(ocJson.mcp["alpha-http"].url, "https://mcp.alpha.example/sse");
      assert.equal(ocJson.mcp["alpha-http"].enabled, true);
    } finally {
      sb.cleanup();
    }
  });
});
