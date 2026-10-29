// tests/sync-adapters.test.mjs
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { makeSandbox } from "./helpers.mjs";

describe("Feature 2 & 3: Native-Format Multi-Agent Adapters (Skills, MCP, Rules, Agents)", () => {
  test("Claude Code adapter links individual <skill>/SKILL.md, merges ~/.claude.json mcpServers, writes CLAUDE.md rules block, and copies subagents", async () => {
    const sb = makeSandbox();
    try {
      const m = await import("../manager.mjs");
      const plugins = m.scanPlugins(sb.hub);

      // Pre-seed user-owned MCP server in ~/.claude.json
      const claudeJson = path.join(sb.home, ".claude.json");
      fs.writeFileSync(
        claudeJson,
        JSON.stringify({ mcpServers: { "user-custom-mcp": { command: "node", args: ["custom.js"] } } }, null, 2),
        "utf8"
      );

      const ide = {
        id: "claude-code",
        name: "Claude Code",
        agentType: "claude-code",
        configPath: path.join(sb.home, ".claude", "skills"),
        enabled: true,
        plugins: { "alpha-plugin": true, "beta-plugin": true },
      };

      const res = m.syncIdePlugins(ide, plugins);
      assert.equal(res.success, true);

      // 1. Skills flattened directly to ~/.claude/skills/<skill-name>/SKILL.md (NOT plugin root!)
      assert.equal(
        fs.existsSync(path.join(sb.home, ".claude", "skills", "code-review", "SKILL.md")),
        true,
        "Claude Code requires ~/.claude/skills/<skill>/SKILL.md directly"
      );
      assert.equal(
        fs.existsSync(path.join(sb.home, ".claude", "skills", "deploy-helper", "SKILL.md")),
        true
      );
      assert.equal(
        fs.existsSync(path.join(sb.home, ".claude", "skills", "alpha-plugin")),
        false,
        "Must NOT link raw plugin bundle folder into ~/.claude/skills"
      );

      // 2. MCP servers merged into ~/.claude.json while preserving user-custom-mcp and creating .asm-bak backup
      assert.equal(fs.existsSync(claudeJson + ".asm-bak"), true, "Must create .asm-bak before modifying user config");
      const parsedClaude = JSON.parse(fs.readFileSync(claudeJson, "utf8"));
      assert.ok(parsedClaude.mcpServers["user-custom-mcp"], "Must preserve user-defined MCP server");
      assert.ok(parsedClaude.mcpServers["alpha-mcp"], "Must inject alpha-mcp from hub");
      assert.ok(parsedClaude.mcpServers["beta-db"], "Must inject beta-db from hub");

      // 3. Rules written to ~/.claude/CLAUDE.md managed block
      const claudeMd = fs.readFileSync(path.join(sb.home, ".claude", "CLAUDE.md"), "utf8");
      assert.match(claudeMd, /agent-space-manager:start/);
      assert.match(claudeMd, /alpha-style\.md/);

      // 4. Subagent copied to ~/.claude/agents/reviewer.md
      assert.equal(fs.existsSync(path.join(sb.home, ".claude", "agents", "reviewer.md")), true);

      // 5. Disable alpha-plugin -> its skills & MCP servers are pruned, beta-plugin & user-custom-mcp remain
      ide.plugins = { "alpha-plugin": false, "beta-plugin": true };
      m.syncIdePlugins(ide, plugins);
      assert.equal(fs.existsSync(path.join(sb.home, ".claude", "skills", "code-review", "SKILL.md")), false);
      assert.equal(fs.existsSync(path.join(sb.home, ".claude", "skills", "deploy-helper", "SKILL.md")), true);
      const afterDisable = JSON.parse(fs.readFileSync(claudeJson, "utf8"));
      assert.equal(Boolean(afterDisable.mcpServers["alpha-mcp"]), false);
      assert.equal(Boolean(afterDisable.mcpServers["beta-db"]), true);
      assert.equal(Boolean(afterDisable.mcpServers["user-custom-mcp"]), true);
    } finally {
      sb.cleanup();
    }
  });

  test("Codex CLI adapter links skills to ~/.codex/skills/<s>, writes managed TOML mcp_servers block to ~/.codex/config.toml, and writes ~/.codex/AGENTS.md", async () => {
    const sb = makeSandbox();
    try {
      const m = await import("../manager.mjs");
      const plugins = m.scanPlugins(sb.hub);

      const codexDir = path.join(sb.home, ".codex");
      fs.mkdirSync(codexDir, { recursive: true });
      const configToml = path.join(codexDir, "config.toml");
      fs.writeFileSync(configToml, 'model = "gpt-5-codex"\n', "utf8");

      const ide = {
        id: "codex",
        name: "Codex CLI",
        agentType: "codex",
        configPath: path.join(codexDir, "skills"),
        enabled: true,
        plugins: { "alpha-plugin": true, "beta-plugin": true },
      };

      m.syncIdePlugins(ide, plugins);

      assert.equal(fs.existsSync(path.join(codexDir, "skills", "code-review", "SKILL.md")), true);
      const tomlText = fs.readFileSync(configToml, "utf8");
      assert.match(tomlText, /model = "gpt-5-codex"/);
      assert.match(tomlText, /\[mcp_servers\.alpha-mcp\]/);
      assert.match(tomlText, /\[mcp_servers\.beta-db\]/);

      // Unlink all cleans TOML block while preserving model line
      m.unlinkAllForIde(ide);
      const tomlAfter = fs.readFileSync(configToml, "utf8");
      assert.match(tomlAfter, /model = "gpt-5-codex"/);
      assert.doesNotMatch(tomlAfter, /\[mcp_servers\.alpha-mcp\]/);
    } finally {
      sb.cleanup();
    }
  });

  test("OpenCode adapter links skills to ~/.config/opencode/skills (NOT plugins/) and transforms MCP to opencode.json schema", async () => {
    const sb = makeSandbox();
    try {
      const m = await import("../manager.mjs");
      const plugins = m.scanPlugins(sb.hub);

      const ide = {
        id: "opencode",
        name: "OpenCode",
        agentType: "opencode",
        configPath: m.detectAgentConfigPath("OpenCode"),
        enabled: true,
        plugins: { "alpha-plugin": true, "beta-plugin": true },
      };

      assert.match(ide.configPath, /skills$/i, "OpenCode configPath must target skills, not plugins");
      m.syncIdePlugins(ide, plugins);

      assert.equal(
        fs.existsSync(path.join(sb.home, ".config", "opencode", "skills", "code-review", "SKILL.md")),
        true
      );
      // Slash commands (/) generated in ~/.config/opencode/commands/<skill>.md
      assert.equal(
        fs.existsSync(path.join(sb.home, ".config", "opencode", "commands", "code-review.md")),
        true,
        "OpenCode slash commands must be generated in ~/.config/opencode/commands/<skill>.md"
      );
      // Subagent (@) generated in ~/.config/opencode/agents/reviewer.md with valid OpenCode v2 frontmatter
      const ocAgentText = fs.readFileSync(
        path.join(sb.home, ".config", "opencode", "agents", "reviewer.md"),
        "utf8"
      );
      assert.match(ocAgentText, /mode:\s*subagent/);
      const opencodeJson = JSON.parse(
        fs.readFileSync(path.join(sb.home, ".config", "opencode", "opencode.json"), "utf8")
      );
      assert.equal(opencodeJson.mcp["alpha-mcp"].type, "local");
      assert.deepEqual(opencodeJson.mcp["alpha-mcp"].command, ["npx", "-y", "@alpha/mcp-server"]);
      assert.deepEqual(opencodeJson.mcp["alpha-mcp"].environment, { ALPHA_KEY: "123" });
      assert.equal(opencodeJson.mcp["alpha-http"].type, "remote");
      assert.equal(opencodeJson.mcp["alpha-http"].url, "https://mcp.alpha.example/sse");
    } finally {
      sb.cleanup();
    }
  });

  test("VS Code Copilot, Cursor, Windsurf, Gemini CLI, Cline, Roo Code, and Kiro adapters write to their native locations", async () => {
    const sb = makeSandbox();
    try {
      const m = await import("../manager.mjs");
      const plugins = m.scanPlugins(sb.hub);

      for (const agentType of ["vscode-copilot", "cursor", "windsurf", "gemini-cli", "cline", "roo-code", "kiro", "agents-universal"]) {
        const ide = {
          id: agentType,
          name: agentType,
          agentType,
          configPath: m.detectAgentConfigPath(agentType),
          enabled: true,
          plugins: { "alpha-plugin": true, "beta-plugin": true },
        };
        const res = m.syncIdePlugins(ide, plugins);
        assert.equal(res.success, true, `Sync failed for ${agentType}`);
        assert.equal(
          fs.existsSync(path.join(ide.configPath, "code-review", "SKILL.md")),
          true,
          `Skill code-review/SKILL.md missing for ${agentType} at ${ide.configPath}`
        );
      }

      // Check VS Code Copilot MCP uses `servers` key in User/mcp.json
      const vscodeMcp = JSON.parse(
        fs.readFileSync(path.join(sb.appData, "Code", "User", "mcp.json"), "utf8")
      );
      assert.ok(vscodeMcp.servers["alpha-mcp"]);

      // Check Cursor MCP uses `mcpServers` in ~/.cursor/mcp.json
      const cursorMcp = JSON.parse(fs.readFileSync(path.join(sb.home, ".cursor", "mcp.json"), "utf8"));
      assert.ok(cursorMcp.mcpServers["alpha-mcp"]);
    } finally {
      sb.cleanup();
    }
  });

  test("Custom componentPaths overrides allow typing custom path link for each component type and unlinking cleans 100%", async () => {
    const sb = makeSandbox();
    try {
      const m = await import("../manager.mjs");
      const plugins = m.scanPlugins(sb.hub);

      const customSkills = path.join(sb.root, "my-custom-skills");
      const customCmds = path.join(sb.root, "my-custom-commands");
      const customMcp = path.join(sb.root, "configs", "custom-mcp.json");
      const customRules = path.join(sb.root, "my-custom-rules.md");
      const customAgents = path.join(sb.root, "my-custom-agents");
      const customHooks = path.join(sb.root, "configs", "custom-hooks.json");

      const ide = {
        id: "custom-claude",
        name: "Custom Claude Setup",
        agentType: "claude-code",
        configPath: customSkills,
        componentPaths: {
          skills: customSkills,
          commands: customCmds,
          mcp: customMcp,
          rules: customRules,
          agents: customAgents,
          hooks: customHooks,
        },
        enabled: true,
        plugins: { "alpha-plugin": true, "beta-plugin": true },
      };

      const res = m.syncIdePlugins(ide, plugins);
      assert.equal(res.success, true);

      // Verify custom skills directory
      assert.equal(fs.existsSync(path.join(customSkills, "code-review", "SKILL.md")), true);
      // Verify custom commands directory
      assert.equal(fs.existsSync(path.join(customCmds, "code-review.md")), true);
      // Verify custom MCP file
      assert.equal(fs.existsSync(customMcp), true);
      const parsedMcp = JSON.parse(fs.readFileSync(customMcp, "utf8"));
      assert.ok(parsedMcp.mcpServers["alpha-mcp"]);
      // Verify custom rules file
      assert.equal(fs.existsSync(customRules), true);
      assert.match(fs.readFileSync(customRules, "utf8"), /alpha-style\.md/);
      // Verify custom agents directory
      assert.equal(fs.existsSync(path.join(customAgents, "reviewer.md")), true);

      // Complete unlinking: user removes connected agent
      m.unlinkAllForIde(ide);

      assert.equal(fs.existsSync(path.join(customSkills, "code-review", "SKILL.md")), false, "Skills must be unlinked");
      assert.equal(fs.existsSync(path.join(customCmds, "code-review.md")), false, "Commands must be unlinked");
      assert.equal(fs.existsSync(path.join(customAgents, "reviewer.md")), false, "Agents must be unlinked");

      const afterMcp = JSON.parse(fs.readFileSync(customMcp, "utf8"));
      assert.equal(Boolean(afterMcp.mcpServers["alpha-mcp"]), false, "Hub MCP servers must be removed from config");

      const afterRules = fs.readFileSync(customRules, "utf8");
      assert.doesNotMatch(afterRules, /agent-space-manager:start/, "Rules block must be completely removed");
    } finally {
      sb.cleanup();
    }
  });

  test("Native adapter with empty plugins (default disabled) links zero components", async () => {
    const sb = makeSandbox();
    try {
      const m = await import("../manager.mjs");
      const plugins = m.scanPlugins(sb.hub);

      const ide = {
        id: "claude-code",
        name: "Claude Code",
        agentType: "claude-code",
        configPath: path.join(sb.home, ".claude", "skills"),
        enabled: true,
        plugins: {}, // Default unchecked / unselected
      };

      const res = m.syncIdePlugins(ide, plugins);
      assert.equal(res.success, true);
      assert.equal(fs.existsSync(path.join(sb.home, ".claude", "skills", "code-review")), false);
      assert.equal(fs.existsSync(path.join(sb.home, ".claude", "skills", "deploy-helper")), false);
      assert.equal(fs.existsSync(path.join(sb.home, ".claude", "CLAUDE.md")), false);
    } finally {
      sb.cleanup();
    }
  });
});
