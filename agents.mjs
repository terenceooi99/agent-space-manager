// agents.mjs
// Registry of major AI Coding Agents & IDEs, their native capability formats,
// and dynamic path resolution across Windows, macOS, and Linux.

import path from "node:path";
import os from "node:os";

export function getHomeDir() {
  return process.env.ASM_HOME_OVERRIDE || process.env.USERPROFILE || process.env.HOME || os.homedir();
}

export function getAppDataDir(home = getHomeDir()) {
  if (process.env.APPDATA) return process.env.APPDATA;
  if (process.platform === "darwin") {
    return path.join(home, "Library", "Application Support");
  }
  if (process.platform === "linux") {
    return process.env.XDG_CONFIG_HOME || path.join(home, ".config");
  }
  return path.join(home, "AppData", "Roaming");
}

/**
 * Expands leading `~`, `~/`, `~\`, `$HOME/`, `%USERPROFILE%\`, or `%APPDATA%\`
 * into the real OS path so Node `fs` never creates a literal `~` directory.
 */
export function expandHomePath(inputPath, home = getHomeDir(), appData = getAppDataDir(home)) {
  if (!inputPath || typeof inputPath !== "string") return inputPath;
  let trimmed = inputPath.trim();
  if (!trimmed) return "";
  // Strip surrounding quotes if user copied path with quotes (e.g. "D:\Path" or 'D:\Path')
  trimmed = trimmed.replace(/^["']+|["']+$/g, "").trim();
  if (!trimmed) return "";
  if (trimmed === "~" || trimmed === "$HOME" || /^%USERPROFILE%$/i.test(trimmed)) {
    return home;
  }
  if (trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return path.join(home, trimmed.slice(2));
  }
  if (trimmed.startsWith("$HOME/") || trimmed.startsWith("$HOME\\")) {
    return path.join(home, trimmed.slice(6));
  }
  if (/^%USERPROFILE%[\\/]/i.test(trimmed)) {
    return path.join(home, trimmed.replace(/^%USERPROFILE%[\\/]/i, ""));
  }
  if (/^%APPDATA%[\\/]/i.test(trimmed)) {
    return path.join(appData, trimmed.replace(/^%APPDATA%[\\/]/i, ""));
  }
  // Strip trailing slashes unless root like C:\ or /
  if (trimmed.length > 3 && (trimmed.endsWith("/") || trimmed.endsWith("\\"))) {
    trimmed = trimmed.replace(/[\\\/]+$/, "");
  }
  return trimmed;
}

/**
 * 13 Standardized Agent Profiles.
 * - mode: "bundle" links full plugin directories (<plugin>/plugin.json, skills/, mcp_config.json, etc.)
 *   AND links flattened skills/rules/agents so `/` slash commands and `@` mentions are universally discoverable.
 * - mode: "convert" extracts and links individual skills (<skill>/SKILL.md), generates `/` slash commands,
 *   merges MCP servers into native config, and injects rules/agents into the agent's native discovery locations.
 */
export const AGENT_PROFILES = {
  antigravity: {
    id: "antigravity",
    label: "Antigravity (Google)",
    mode: "bundle",
    description: "Native plugin bundles (~/.gemini/config/plugins) + global skills/rules/agents (~/.gemini/config/skills)",
    capabilities: { skills: true, mcp: true, rules: true, agents: true, hooks: true },
    match: /\b(antigravity|agy)\b/i,
    exeNames: ["agy", "antigravity"],
    resolvePaths(home = getHomeDir()) {
      const base = path.join(home, ".gemini", "config");
      return {
        primary: path.join(base, "plugins"),
        bundle: path.join(base, "plugins"),
        skills: path.join(base, "skills"),
        rulesDir: { dir: path.join(base, "rules"), suffix: ".md", format: "antigravity-rule" },
        agentsDir: { dir: path.join(base, "agents"), suffix: ".md" },
        mcp: { file: path.join(base, "mcp_config.json"), format: "json", key: "mcpServers" },
        hooks: { file: path.join(base, "hooks.json"), format: "json" },
        skillsJson: path.join(base, "skills.json"),
        pluginsJson: path.join(base, "plugins.json"),
      };
    },
    resolveProjectPaths(repoPath) {
      return {
        skills: path.join(repoPath, ".agents", "skills"),
        rulesDir: path.join(repoPath, ".agents", "rules"),
        agents: path.join(repoPath, ".agents", "agents"),
        mcp: { file: path.join(repoPath, ".agents", "mcp_config.json"), format: "json", key: "mcpServers" },
        hooks: { file: path.join(repoPath, ".agents", "hooks.json"), format: "json" },
        excludeRel: [".agents/skills", ".agents/rules", ".agents/agents", ".agents/mcp_config.json", ".agents/hooks.json"],
      };
    },
  },

  "claude-code": {
    id: "claude-code",
    label: "Claude Code (Anthropic)",
    mode: "convert",
    description: "Skills in ~/.claude/skills, /commands in ~/.claude/commands, MCP in ~/.claude.json, Rules in ~/.claude/CLAUDE.md, @agents in ~/.claude/agents, Hooks in ~/.claude/hooks.json",
    capabilities: { skills: true, mcp: true, rules: true, agents: true, hooks: true },
    match: /\bclaude\b/i,
    exeNames: ["claude"],
    resolvePaths(home = getHomeDir()) {
      const claudeDir = path.join(home, ".claude");
      return {
        primary: path.join(claudeDir, "skills"),
        skills: path.join(claudeDir, "skills"),
        commandsDir: { dir: path.join(claudeDir, "commands"), suffix: ".md", format: "claude-command" },
        agents: path.join(claudeDir, "agents"),
        mcp: { file: path.join(home, ".claude.json"), format: "json", key: "mcpServers" },
        rules: { file: path.join(claudeDir, "CLAUDE.md"), format: "import-block" },
        hooks: { file: path.join(claudeDir, "hooks.json"), format: "json" },
      };
    },
    resolveProjectPaths(repoPath) {
      return {
        skills: path.join(repoPath, ".claude", "skills"),
        commandsDir: { dir: path.join(repoPath, ".claude", "commands"), suffix: ".md", format: "claude-command" },
        agents: path.join(repoPath, ".claude", "agents"),
        mcp: { file: path.join(repoPath, ".mcp.json"), format: "json", key: "mcpServers" },
        rules: { file: path.join(repoPath, "CLAUDE.md"), format: "import-block" },
        hooks: { file: path.join(repoPath, ".claude", "hooks.json"), format: "json" },
        excludeRel: [".claude/skills", ".claude/commands", ".claude/agents", ".mcp.json", "CLAUDE.md", ".claude/hooks.json"],
      };
    },
  },

  codex: {
    id: "codex",
    label: "Codex CLI (OpenAI)",
    mode: "convert",
    description: "Skills in ~/.codex/skills, /prompts in ~/.codex/prompts, MCP in ~/.codex/config.toml, Rules in ~/.codex/AGENTS.md, @agents in ~/.codex/agents",
    capabilities: { skills: true, mcp: true, rules: true, agents: true, hooks: false },
    match: /\bcodex\b/i,
    exeNames: ["codex"],
    resolvePaths(home = getHomeDir()) {
      const codexDir = path.join(home, ".codex");
      return {
        primary: path.join(codexDir, "skills"),
        skills: path.join(codexDir, "skills"),
        commandsDir: { dir: path.join(codexDir, "prompts"), suffix: ".md", format: "markdown-command" },
        agents: { dir: path.join(codexDir, "agents"), suffix: ".md" },
        mcp: { file: path.join(codexDir, "config.toml"), format: "toml-block" },
        rules: { file: path.join(codexDir, "AGENTS.md"), format: "inline-block" },
      };
    },
    resolveProjectPaths(repoPath) {
      return {
        skills: path.join(repoPath, ".codex", "skills"),
        commandsDir: { dir: path.join(repoPath, ".codex", "prompts"), suffix: ".md", format: "markdown-command" },
        agents: { dir: path.join(repoPath, ".codex", "agents"), suffix: ".md" },
        mcp: { file: path.join(repoPath, ".codex", "config.toml"), format: "toml-block" },
        rules: { file: path.join(repoPath, "AGENTS.md"), format: "inline-block" },
        excludeRel: [".codex/skills", ".codex/prompts", ".codex/agents", ".codex/config.toml", "AGENTS.md"],
      };
    },
  },

  opencode: {
    id: "opencode",
    label: "OpenCode",
    mode: "convert",
    description: "Skills (@) in ~/.config/opencode/skills, Slash commands (/) in commands/, Subagents (@) in agents/, MCP in opencode.json, Rules in AGENTS.md",
    capabilities: { skills: true, mcp: true, rules: true, agents: true, hooks: false },
    match: /\bopencode\b/i,
    exeNames: ["opencode", "opencode-cli"],
    resolvePaths(home = getHomeDir()) {
      const ocDir = path.join(home, ".config", "opencode");
      return {
        primary: path.join(ocDir, "skills"),
        skills: path.join(ocDir, "skills"),
        commandsDir: { dir: path.join(ocDir, "commands"), suffix: ".md", format: "opencode-command" },
        agents: { dir: path.join(ocDir, "agents"), suffix: ".md", format: "opencode-agent" },
        mcp: { file: path.join(ocDir, "opencode.json"), format: "opencode-json", key: "mcp" },
        rules: { file: path.join(ocDir, "AGENTS.md"), format: "inline-block" },
      };
    },
    resolveProjectPaths(repoPath) {
      return {
        skills: path.join(repoPath, ".opencode", "skills"),
        commandsDir: { dir: path.join(repoPath, ".opencode", "commands"), suffix: ".md", format: "opencode-command" },
        agents: { dir: path.join(repoPath, ".opencode", "agents"), suffix: ".md", format: "opencode-agent" },
        mcp: { file: path.join(repoPath, "opencode.json"), format: "opencode-json", key: "mcp" },
        rules: { file: path.join(repoPath, "AGENTS.md"), format: "inline-block" },
        excludeRel: [".opencode/skills", ".opencode/commands", ".opencode/agents", "opencode.json", "AGENTS.md"],
      };
    },
  },

  "vscode-copilot": {
    id: "vscode-copilot",
    label: "VS Code / GitHub Copilot",
    mode: "convert",
    description: "Skills in ~/.copilot/skills, MCP in Code/User/mcp.json, /Prompts, Instructions & @Agents in Code/User/prompts, Hooks in ~/.copilot/hooks",
    capabilities: { skills: true, mcp: true, rules: true, agents: true, hooks: true },
    match: /\b(vscode|copilot|visual\s*studio\s*code|code)\b/i,
    exeNames: ["code"],
    resolvePaths(home = getHomeDir(), appData = getAppDataDir(home)) {
      const codeUser = path.join(appData, "Code", "User");
      return {
        primary: path.join(home, ".copilot", "skills"),
        skills: path.join(home, ".copilot", "skills"),
        commandsDir: { dir: path.join(codeUser, "prompts"), suffix: ".prompt.md", format: "copilot-prompt" },
        mcp: { file: path.join(codeUser, "mcp.json"), format: "json", key: "servers" },
        rulesDir: { dir: path.join(codeUser, "prompts"), suffix: ".instructions.md" },
        agentsDir: { dir: path.join(codeUser, "prompts"), suffix: ".agent.md" },
        hooks: { file: path.join(home, ".copilot", "hooks", "hooks.json"), format: "json" },
      };
    },
    resolveProjectPaths(repoPath) {
      return {
        skills: path.join(repoPath, ".github", "skills"),
        commandsDir: { dir: path.join(repoPath, ".github", "prompts"), suffix: ".prompt.md", format: "copilot-prompt" },
        mcp: { file: path.join(repoPath, ".vscode", "mcp.json"), format: "json", key: "servers" },
        rulesDir: { dir: path.join(repoPath, ".github", "instructions"), suffix: ".instructions.md" },
        agentsDir: { dir: path.join(repoPath, ".github", "agents"), suffix: ".agent.md" },
        hooks: { file: path.join(repoPath, ".github", "hooks", "hooks.json"), format: "json" },
        excludeRel: [".github/skills", ".github/prompts", ".vscode/mcp.json", ".github/instructions", ".github/agents", ".github/hooks"],
      };
    },
  },

  cursor: {
    id: "cursor",
    label: "Cursor AI",
    mode: "convert",
    description: "Skills in ~/.cursor/skills, /commands in ~/.cursor/commands, MCP in ~/.cursor/mcp.json, Rules in ~/.cursor/rules, @agents in ~/.cursor/agents, Hooks in ~/.cursor/hooks.json",
    capabilities: { skills: true, mcp: true, rules: true, agents: true, hooks: true },
    match: /\bcursor\b/i,
    exeNames: ["cursor"],
    resolvePaths(home = getHomeDir()) {
      const curDir = path.join(home, ".cursor");
      return {
        primary: path.join(curDir, "skills"),
        skills: path.join(curDir, "skills"),
        commandsDir: { dir: path.join(curDir, "commands"), suffix: ".md", format: "markdown-command" },
        rulesDir: { dir: path.join(curDir, "rules"), suffix: ".mdc" },
        agentsDir: { dir: path.join(curDir, "agents"), suffix: ".md" },
        mcp: { file: path.join(curDir, "mcp.json"), format: "json", key: "mcpServers" },
        hooks: { file: path.join(curDir, "hooks.json"), format: "json" },
      };
    },
    resolveProjectPaths(repoPath) {
      return {
        skills: path.join(repoPath, ".cursor", "skills"),
        commandsDir: { dir: path.join(repoPath, ".cursor", "commands"), suffix: ".md", format: "markdown-command" },
        mcp: { file: path.join(repoPath, ".cursor", "mcp.json"), format: "json", key: "mcpServers" },
        rulesDir: path.join(repoPath, ".cursor", "rules"),
        agentsDir: path.join(repoPath, ".cursor", "agents"),
        hooks: { file: path.join(repoPath, ".cursor", "hooks.json"), format: "json" },
        excludeRel: [".cursor/skills", ".cursor/commands", ".cursor/mcp.json", ".cursor/rules", ".cursor/agents", ".cursor/hooks.json"],
      };
    },
  },

  windsurf: {
    id: "windsurf",
    label: "Windsurf (Codeium)",
    mode: "convert",
    description: "Skills in ~/.codeium/windsurf/skills, /workflows in global_workflows/, MCP in mcp_config.json, Rules in memories/global_rules.md, Hooks in hooks.json",
    capabilities: { skills: true, mcp: true, rules: true, agents: false, hooks: true },
    match: /\b(windsurf|codeium)\b/i,
    exeNames: ["windsurf"],
    resolvePaths(home = getHomeDir()) {
      const wsDir = path.join(home, ".codeium", "windsurf");
      return {
        primary: path.join(wsDir, "skills"),
        skills: path.join(wsDir, "skills"),
        commandsDir: { dir: path.join(wsDir, "global_workflows"), suffix: ".md", format: "markdown-command" },
        mcp: { file: path.join(wsDir, "mcp_config.json"), format: "json", key: "mcpServers" },
        rules: { file: path.join(wsDir, "memories", "global_rules.md"), format: "inline-block" },
        hooks: { file: path.join(wsDir, "hooks.json"), format: "json" },
      };
    },
    resolveProjectPaths(repoPath) {
      return {
        skills: path.join(repoPath, ".windsurf", "skills"),
        commandsDir: { dir: path.join(repoPath, ".windsurf", "workflows"), suffix: ".md", format: "markdown-command" },
        rulesDir: path.join(repoPath, ".windsurf", "rules"),
        hooks: { file: path.join(repoPath, ".windsurf", "hooks.json"), format: "json" },
        excludeRel: [".windsurf/skills", ".windsurf/workflows", ".windsurf/rules", ".windsurf/hooks.json"],
      };
    },
  },

  "gemini-cli": {
    id: "gemini-cli",
    label: "Gemini CLI (Standalone)",
    mode: "convert",
    description: "Skills in ~/.gemini/skills, /commands in ~/.gemini/commands, MCP in ~/.gemini/settings.json, Rules in ~/.gemini/GEMINI.md, @agents in ~/.gemini/agents, Hooks in ~/.gemini/hooks",
    capabilities: { skills: true, mcp: true, rules: true, agents: true, hooks: true },
    match: /\bgemini[-_\s]*cli\b/i,
    exeNames: ["gemini"],
    resolvePaths(home = getHomeDir()) {
      const gemDir = path.join(home, ".gemini");
      return {
        primary: path.join(gemDir, "skills"),
        skills: path.join(gemDir, "skills"),
        commandsDir: { dir: path.join(gemDir, "commands"), suffix: ".toml", format: "gemini-toml-command" },
        agents: { dir: path.join(gemDir, "agents"), suffix: ".md" },
        mcp: { file: path.join(gemDir, "settings.json"), format: "json", key: "mcpServers" },
        rules: { file: path.join(gemDir, "GEMINI.md"), format: "inline-block" },
        hooks: { file: path.join(gemDir, "hooks", "hooks.json"), format: "json" },
      };
    },
    resolveProjectPaths(repoPath) {
      return {
        skills: path.join(repoPath, ".gemini", "skills"),
        commandsDir: { dir: path.join(repoPath, ".gemini", "commands"), suffix: ".toml", format: "gemini-toml-command" },
        agents: { dir: path.join(repoPath, ".gemini", "agents"), suffix: ".md" },
        rules: { file: path.join(repoPath, "GEMINI.md"), format: "inline-block" },
        mcp: { file: path.join(repoPath, ".gemini", "settings.json"), format: "json", key: "mcpServers" },
        hooks: { file: path.join(repoPath, ".gemini", "hooks", "hooks.json"), format: "json" },
        excludeRel: [".gemini/skills", ".gemini/commands", ".gemini/agents", "GEMINI.md", ".gemini/settings.json", ".gemini/hooks"],
      };
    },
  },

  cline: {
    id: "cline",
    label: "Cline (VS Code Extension)",
    mode: "convert",
    description: "Skills in ~/.cline/skills, /workflows in ~/Documents/Cline/Workflows, MCP in cline_mcp_settings.json, Rules in ~/Documents/Cline/Rules, Hooks in ~/Documents/Cline/Hooks",
    capabilities: { skills: true, mcp: true, rules: true, agents: false, hooks: true },
    match: /\b(cline|claude-dev)\b/i,
    exeNames: ["cline"],
    resolvePaths(home = getHomeDir(), appData = getAppDataDir(home)) {
      const storage = path.join(appData, "Code", "User", "globalStorage", "saoudrizwan.claude-dev", "settings");
      return {
        primary: path.join(home, ".cline", "skills"),
        skills: path.join(home, ".cline", "skills"),
        commandsDir: { dir: path.join(home, "Documents", "Cline", "Workflows"), suffix: ".md", format: "markdown-command" },
        mcp: { file: path.join(storage, "cline_mcp_settings.json"), format: "json", key: "mcpServers" },
        rulesDir: { dir: path.join(home, "Documents", "Cline", "Rules"), suffix: ".md" },
        hooks: { file: path.join(home, "Documents", "Cline", "Hooks", "hooks.json"), format: "json" },
      };
    },
    resolveProjectPaths(repoPath) {
      return {
        skills: path.join(repoPath, ".cline", "skills"),
        rulesDir: path.join(repoPath, ".clinerules"),
        excludeRel: [".cline/skills", ".clinerules"],
      };
    },
  },

  "roo-code": {
    id: "roo-code",
    label: "Roo Code",
    mode: "convert",
    description: "Skills in ~/.roo/skills, /commands in ~/.roo/commands, MCP in rooveterinaryinc.roo-cline mcp_settings.json, Rules in ~/.roo/rules, @agents in ~/.roo/agents",
    capabilities: { skills: true, mcp: true, rules: true, agents: true, hooks: false },
    match: /\b(roo|roo-code|roo-cline)\b/i,
    exeNames: ["roo"],
    resolvePaths(home = getHomeDir(), appData = getAppDataDir(home)) {
      const storage = path.join(appData, "Code", "User", "globalStorage", "rooveterinaryinc.roo-cline", "settings");
      return {
        primary: path.join(home, ".roo", "skills"),
        skills: path.join(home, ".roo", "skills"),
        commandsDir: { dir: path.join(home, ".roo", "commands"), suffix: ".md", format: "markdown-command" },
        agents: { dir: path.join(home, ".roo", "agents"), suffix: ".md" },
        mcp: { file: path.join(storage, "mcp_settings.json"), format: "json", key: "mcpServers" },
        rulesDir: { dir: path.join(home, ".roo", "rules"), suffix: ".md" },
      };
    },
    resolveProjectPaths(repoPath) {
      return {
        skills: path.join(repoPath, ".roo", "skills"),
        commandsDir: { dir: path.join(repoPath, ".roo", "commands"), suffix: ".md", format: "markdown-command" },
        agents: { dir: path.join(repoPath, ".roo", "agents"), suffix: ".md" },
        rulesDir: path.join(repoPath, ".roo", "rules"),
        mcp: { file: path.join(repoPath, ".roo", "mcp.json"), format: "json", key: "mcpServers" },
        excludeRel: [".roo/skills", ".roo/commands", ".roo/agents", ".roo/rules", ".roo/mcp.json"],
      };
    },
  },

  kiro: {
    id: "kiro",
    label: "Kiro (AWS)",
    mode: "convert",
    description: "Skills in ~/.kiro/skills, /workflows in ~/.kiro/workflows, MCP in ~/.kiro/settings/mcp.json, Steering rules in ~/.kiro/steering, @agents in ~/.kiro/agents, Hooks in ~/.kiro/hooks",
    capabilities: { skills: true, mcp: true, rules: true, agents: true, hooks: true },
    match: /\bkiro\b/i,
    exeNames: ["kiro"],
    resolvePaths(home = getHomeDir()) {
      const kiroDir = path.join(home, ".kiro");
      return {
        primary: path.join(kiroDir, "skills"),
        skills: path.join(kiroDir, "skills"),
        commandsDir: { dir: path.join(kiroDir, "workflows"), suffix: ".md", format: "markdown-command" },
        agents: { dir: path.join(kiroDir, "agents"), suffix: ".md" },
        mcp: { file: path.join(kiroDir, "settings", "mcp.json"), format: "json", key: "mcpServers" },
        rulesDir: { dir: path.join(kiroDir, "steering"), suffix: ".md" },
        hooks: { file: path.join(kiroDir, "hooks", "hooks.json"), format: "json" },
      };
    },
    resolveProjectPaths(repoPath) {
      return {
        skills: path.join(repoPath, ".kiro", "skills"),
        commandsDir: { dir: path.join(repoPath, ".kiro", "workflows"), suffix: ".md", format: "markdown-command" },
        agents: { dir: path.join(repoPath, ".kiro", "agents"), suffix: ".md" },
        rulesDir: path.join(repoPath, ".kiro", "steering"),
        mcp: { file: path.join(repoPath, ".kiro", "settings", "mcp.json"), format: "json", key: "mcpServers" },
        hooks: { file: path.join(repoPath, ".kiro", "hooks", "hooks.json"), format: "json" },
        excludeRel: [".kiro/skills", ".kiro/workflows", ".kiro/agents", ".kiro/steering", ".kiro/settings", ".kiro/hooks"],
      };
    },
  },

  "agents-universal": {
    id: "agents-universal",
    label: "Universal Agent Skills (~/.agents/skills)",
    mode: "convert",
    description: "Shared ~/.agents/skills directory read by OpenCode, Copilot, Codex, and Antigravity",
    capabilities: { skills: true, mcp: false, rules: false, agents: false, hooks: false },
    match: /\b(agents-universal|universal|\.agents)\b/i,
    exeNames: [],
    resolvePaths(home = getHomeDir()) {
      const dir = path.join(home, ".agents", "skills");
      return { primary: dir, skills: dir };
    },
    resolveProjectPaths(repoPath) {
      return {
        skills: path.join(repoPath, ".agents", "skills"),
        excludeRel: [".agents/skills"],
      };
    },
  },

  custom: {
    id: "custom",
    label: "Custom Agent / Directory",
    mode: "convert",
    description: "User-specified target directory (links individual skills or plugin bundles)",
    capabilities: { skills: true, mcp: false, rules: false, agents: false, hooks: false },
    match: /^$/,
    exeNames: [],
    resolvePaths(home = getHomeDir(), _appData, customName = "agent") {
      const clean = (customName || "agent").toLowerCase().replace(/[^a-z0-9_-]/g, "") || "agent";
      const dir = path.join(home, `.${clean}`, "skills");
      return { primary: dir, skills: dir };
    },
    resolveProjectPaths(repoPath) {
      return {
        skills: path.join(repoPath, ".agents", "skills"),
        excludeRel: [".agents/skills"],
      };
    },
  },
};

/**
 * Infers the canonical agent profile ID from an IDE object, name, exePath, or configPath.
 */
export function inferAgentType(ideOrName = "", exePath = "", configPath = "") {
  if (ideOrName && typeof ideOrName === "object") {
    if (ideOrName.agentType && AGENT_PROFILES[ideOrName.agentType]) {
      return ideOrName.agentType;
    }
    return inferAgentType(ideOrName.name || ideOrName.id || "", ideOrName.exePath || "", ideOrName.configPath || "");
  }

  const rawName = String(ideOrName || "").trim();
  const lowerName = rawName.toLowerCase();
  if (AGENT_PROFILES[lowerName]) return lowerName;

  const combined = `${rawName} ${exePath || ""} ${configPath || ""}`.toLowerCase();

  // Order matters to prevent substring collisions:
  // 1. Check OpenCode before VS Code ("opencode" contains "code")
  if (/\bopencode\b/.test(combined)) return "opencode";
  // 2. Check Roo Code before Cline or VS Code ("rooveterinaryinc.roo-cline" contains "cline" and "code")
  if (/\broo\b|roo-cline|rooveterinaryinc/.test(combined)) return "roo-code";
  // 3. Check Cline before Claude ("saoudrizwan.claude-dev" contains "claude")
  if (/\bcline\b|claude-dev/.test(combined)) return "cline";
  // 4. Check Gemini CLI vs Antigravity (.gemini/config/plugins is Antigravity; "gemini-cli" or "gemini cli" is Gemini CLI)
  if (/gemini[-_\s]*cli/.test(combined) || (/[\\/]\.gemini[\\/]skills$/i.test(combined) && !/antigravity/i.test(combined))) {
    return "gemini-cli";
  }
  if (/antigravity|\bagy\b|\.gemini[\\/]config/i.test(combined)) return "antigravity";
  if (/\bcodex\b/.test(combined)) return "codex";
  if (/\bclaude\b/.test(combined)) return "claude-code";
  if (/\bcursor\b/.test(combined)) return "cursor";
  if (/\bwindsurf\b|\bcodeium\b/.test(combined)) return "windsurf";
  if (/\bkiro\b/.test(combined)) return "kiro";
  if (/agents-universal|[\\/]\.agents[\\/]skills/i.test(combined)) return "agents-universal";
  if (/\bvscode\b|\bcopilot\b|visual\s*studio\s*code|\bcode\b|code\.exe/i.test(combined)) return "vscode-copilot";

  return "custom";
}

/**
 * Returns serializable profile metadata for the UI picker and `/api/agents`.
 */
export function listAgentProfilesForUi() {
  const home = getHomeDir();
  const appData = getAppDataDir(home);
  return Object.values(AGENT_PROFILES).map((p) => {
    const resolved = p.resolvePaths(home, appData);
    const dummyRepo = "<repo>";
    const proj = p.resolveProjectPaths ? p.resolveProjectPaths(dummyRepo) : null;
    return {
      id: p.id,
      label: p.label,
      mode: p.mode,
      description: p.description,
      capabilities: p.capabilities,
      defaultConfigPath: resolved.primary,
      paths: {
        primary: resolved.primary,
        bundle: resolved.bundle || (p.mode === "bundle" ? resolved.primary : null),
        skills: resolved.skills || (p.mode === "bundle" ? path.join(path.dirname(resolved.primary), "skills") : resolved.primary),
        commands: resolved.commandsDir?.dir || null,
        mcp: resolved.mcp?.file || (p.mode === "bundle" ? path.join(path.dirname(resolved.primary), "mcp_config.json") : null),
        rules: resolved.rules?.file || resolved.rulesDir?.dir || (p.mode === "bundle" ? path.join(path.dirname(resolved.primary), "rules") : null),
        agents: (typeof resolved.agents === "object" ? resolved.agents?.dir : resolved.agents) || resolved.agentsDir?.dir || (p.mode === "bundle" ? path.join(path.dirname(resolved.primary), "agents") : null),
        hooks: resolved.hooks?.file || (p.mode === "bundle" ? path.join(path.dirname(resolved.primary), "hooks.json") : null),
      },
      projectPaths: proj ? {
        skills: proj.skills || null,
        commands: proj.commandsDir?.dir || null,
        mcp: proj.mcp?.file || null,
        rules: proj.rules?.file || proj.rulesDir?.dir || proj.rulesDir || null,
        agents: (typeof proj.agents === "object" ? proj.agents?.dir : proj.agents) || proj.agentsDir?.dir || null,
        hooks: proj.hooks?.file || null,
      } : null,
    };
  });
}

/**
 * Resolves effective target paths for an IDE, merging agent profile defaults with user componentPaths overrides.
 */
export function resolveEffectiveAgentPaths(ide, home = getHomeDir(), appData = getAppDataDir(home)) {
  if (!ide) return {};
  const agentType = inferAgentType(ide);
  const profile = AGENT_PROFILES[agentType] || AGENT_PROFILES.custom;
  const base = profile.resolvePaths(home, appData, ide.name || ide.id);
  const cp = ide.componentPaths && typeof ide.componentPaths === "object" ? ide.componentPaths : {};

  const res = { ...base };

  if (cp.bundle) {
    res.bundle = expandHomePath(cp.bundle, home, appData);
    res.primary = res.bundle;
  }
  if (cp.skills) {
    res.skills = expandHomePath(cp.skills, home, appData);
    if (profile.mode !== "bundle" && !cp.bundle) {
      res.primary = res.skills;
    }
  }
  if (cp.commands) {
    const dir = expandHomePath(cp.commands, home, appData);
    res.commandsDir = typeof res.commandsDir === "object"
      ? { ...res.commandsDir, dir }
      : { dir, suffix: ".md", format: "markdown-command" };
  }
  if (cp.mcp) {
    const file = expandHomePath(cp.mcp, home, appData);
    res.mcp = typeof res.mcp === "object"
      ? { ...res.mcp, file }
      : { file, format: file.endsWith(".toml") ? "toml-block" : "json", key: "mcpServers" };
  }
  if (cp.rules) {
    const rPath = expandHomePath(cp.rules, home, appData);
    if (rPath.endsWith(".md") || rPath.endsWith(".mdc")) {
      res.rules = typeof res.rules === "object"
        ? { ...res.rules, file: rPath }
        : { file: rPath, format: "inline-block" };
      delete res.rulesDir;
    } else {
      res.rulesDir = typeof res.rulesDir === "object"
        ? { ...res.rulesDir, dir: rPath }
        : { dir: rPath, suffix: ".md" };
      delete res.rules;
    }
  }
  if (cp.agents) {
    const aPath = expandHomePath(cp.agents, home, appData);
    if (typeof res.agents === "object" && res.agents?.dir) {
      res.agents = { ...res.agents, dir: aPath };
    } else if (res.agentsDir) {
      res.agentsDir = { ...res.agentsDir, dir: aPath };
    } else {
      res.agents = aPath;
    }
  }
  if (cp.hooks) {
    const hFile = expandHomePath(cp.hooks, home, appData);
    res.hooks = typeof res.hooks === "object"
      ? { ...res.hooks, file: hFile }
      : { file: hFile, format: "json" };
  }

  // If primary configPath was explicitly passed on ide.configPath, expand it
  if (ide.configPath && !cp.bundle && !cp.skills) {
    res.primary = expandHomePath(ide.configPath, home, appData);
    if (profile.mode === "bundle") {
      res.bundle = res.primary;
    } else {
      res.skills = res.primary;
    }
  }

  return res;
}

/**
 * Resolves effective target paths for a Project repository, merging profile defaults with user componentPaths overrides.
 */
export function resolveEffectiveProjectPaths(project, ide) {
  const repoPath = expandHomePath(project?.repoPath || "");
  const agentType = inferAgentType(ide || project?.ideId || "antigravity");
  const profile = AGENT_PROFILES[agentType] || AGENT_PROFILES.custom;
  const base = profile.resolveProjectPaths
    ? profile.resolveProjectPaths(repoPath)
    : { skills: path.join(repoPath, ".agents", "skills"), excludeRel: [".agents/skills"] };
  const cp = project?.componentPaths && typeof project.componentPaths === "object" ? project.componentPaths : {};

  const res = { ...base };
  if (cp.skills) res.skills = expandHomePath(cp.skills);
  if (cp.commands) {
    const dir = expandHomePath(cp.commands);
    res.commandsDir = typeof res.commandsDir === "object" ? { ...res.commandsDir, dir } : { dir, suffix: ".md", format: "markdown-command" };
  }
  if (cp.mcp) {
    const file = expandHomePath(cp.mcp);
    res.mcp = typeof res.mcp === "object" ? { ...res.mcp, file } : { file, format: file.endsWith(".toml") ? "toml-block" : "json", key: "mcpServers" };
  }
  if (cp.rules) {
    const rPath = expandHomePath(cp.rules);
    if (rPath.endsWith(".md") || rPath.endsWith(".mdc")) {
      res.rules = typeof res.rules === "object" ? { ...res.rules, file: rPath } : { file: rPath, format: "inline-block" };
      delete res.rulesDir;
    } else {
      res.rulesDir = typeof res.rulesDir === "object" ? { ...res.rulesDir, dir: rPath } : { dir: rPath, suffix: ".md" };
      delete res.rules;
    }
  }
  if (cp.agents) {
    res.agents = expandHomePath(cp.agents);
  }
  if (cp.hooks) {
    const file = expandHomePath(cp.hooks);
    res.hooks = typeof res.hooks === "object" ? { ...res.hooks, file } : { file, format: "json" };
  }
  return res;
}
