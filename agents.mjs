// agents.mjs
// Registry of major AI Coding Agents & IDEs, their native capability formats,
// and dynamic path resolution across Windows, macOS, and Linux.

import path from "node:path";
import os from "node:os";

export function getHomeDir() {
  return process.env.ASM_HOME_OVERRIDE || process.env.USERPROFILE || process.env.HOME || os.homedir();
}

export function getAppDataDir(home = getHomeDir()) {
  return process.env.APPDATA || (process.platform === "darwin"
    ? path.join(home, "Library", "Application Support")
    : path.join(home, "AppData", "Roaming"));
}

/**
 * Expands leading `~`, `~/`, `~\`, `$HOME/`, `%USERPROFILE%\`, or `%APPDATA%\`
 * into the real OS path so Node `fs` never creates a literal `~` directory.
 */
export function expandHomePath(inputPath, home = getHomeDir(), appData = getAppDataDir(home)) {
  if (!inputPath || typeof inputPath !== "string") return inputPath;
  const trimmed = inputPath.trim();
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
        rulesDir: { dir: path.join(base, "rules"), suffix: ".md" },
        agentsDir: { dir: path.join(base, "agents"), suffix: ".md" },
        skillsJson: path.join(base, "skills.json"),
      };
    },
    resolveProjectPaths(repoPath) {
      return {
        skills: path.join(repoPath, ".agents", "skills"),
        rulesDir: path.join(repoPath, ".agents", "rules"),
        excludeRel: [".agents/skills", ".agents/rules"],
      };
    },
  },

  "claude-code": {
    id: "claude-code",
    label: "Claude Code (Anthropic)",
    mode: "convert",
    description: "Skills in ~/.claude/skills, /commands in ~/.claude/commands, MCP in ~/.claude.json, Rules in ~/.claude/CLAUDE.md, @agents in ~/.claude/agents",
    capabilities: { skills: true, mcp: true, rules: true, agents: true, hooks: false },
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
      };
    },
    resolveProjectPaths(repoPath) {
      return {
        skills: path.join(repoPath, ".claude", "skills"),
        commandsDir: { dir: path.join(repoPath, ".claude", "commands"), suffix: ".md", format: "claude-command" },
        agents: path.join(repoPath, ".claude", "agents"),
        mcp: { file: path.join(repoPath, ".mcp.json"), format: "json", key: "mcpServers" },
        rules: { file: path.join(repoPath, "CLAUDE.md"), format: "import-block" },
        excludeRel: [".claude/skills", ".claude/commands", ".claude/agents", ".mcp.json", "CLAUDE.md"],
      };
    },
  },

  codex: {
    id: "codex",
    label: "Codex CLI (OpenAI)",
    mode: "convert",
    description: "Skills in ~/.codex/skills, /prompts in ~/.codex/prompts, MCP in ~/.codex/config.toml, Rules in ~/.codex/AGENTS.md",
    capabilities: { skills: true, mcp: true, rules: true, agents: false, hooks: false },
    match: /\bcodex\b/i,
    exeNames: ["codex"],
    resolvePaths(home = getHomeDir()) {
      const codexDir = path.join(home, ".codex");
      return {
        primary: path.join(codexDir, "skills"),
        skills: path.join(codexDir, "skills"),
        commandsDir: { dir: path.join(codexDir, "prompts"), suffix: ".md", format: "markdown-command" },
        mcp: { file: path.join(codexDir, "config.toml"), format: "toml-block" },
        rules: { file: path.join(codexDir, "AGENTS.md"), format: "inline-block" },
      };
    },
    resolveProjectPaths(repoPath) {
      return {
        skills: path.join(repoPath, ".codex", "skills"),
        mcp: { file: path.join(repoPath, ".codex", "config.toml"), format: "toml-block" },
        rules: { file: path.join(repoPath, "AGENTS.md"), format: "inline-block" },
        excludeRel: [".codex/skills", ".codex/config.toml"],
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
        excludeRel: [".opencode/skills", ".opencode/commands", ".opencode/agents", "opencode.json"],
      };
    },
  },

  "vscode-copilot": {
    id: "vscode-copilot",
    label: "VS Code / GitHub Copilot",
    mode: "convert",
    description: "Skills in ~/.copilot/skills, MCP in Code/User/mcp.json, /Prompts, Instructions & @Agents in Code/User/prompts",
    capabilities: { skills: true, mcp: true, rules: true, agents: true, hooks: false },
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
      };
    },
    resolveProjectPaths(repoPath) {
      return {
        skills: path.join(repoPath, ".github", "skills"),
        mcp: { file: path.join(repoPath, ".vscode", "mcp.json"), format: "json", key: "servers" },
        excludeRel: [".github/skills", ".vscode/mcp.json"],
      };
    },
  },

  cursor: {
    id: "cursor",
    label: "Cursor AI",
    mode: "convert",
    description: "Skills in ~/.cursor/skills, /commands in ~/.cursor/commands, MCP in ~/.cursor/mcp.json",
    capabilities: { skills: true, mcp: true, rules: true, agents: true, hooks: false },
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
      };
    },
    resolveProjectPaths(repoPath) {
      return {
        skills: path.join(repoPath, ".cursor", "skills"),
        commandsDir: { dir: path.join(repoPath, ".cursor", "commands"), suffix: ".md", format: "markdown-command" },
        mcp: { file: path.join(repoPath, ".cursor", "mcp.json"), format: "json", key: "mcpServers" },
        rulesDir: path.join(repoPath, ".cursor", "rules"),
        excludeRel: [".cursor/skills", ".cursor/commands", ".cursor/mcp.json", ".cursor/rules"],
      };
    },
  },

  windsurf: {
    id: "windsurf",
    label: "Windsurf (Codeium)",
    mode: "convert",
    description: "Skills in ~/.codeium/windsurf/skills, /workflows in global_workflows/, MCP in mcp_config.json, Rules in memories/global_rules.md",
    capabilities: { skills: true, mcp: true, rules: true, agents: false, hooks: false },
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
      };
    },
    resolveProjectPaths(repoPath) {
      return {
        skills: path.join(repoPath, ".windsurf", "skills"),
        commandsDir: { dir: path.join(repoPath, ".windsurf", "workflows"), suffix: ".md", format: "markdown-command" },
        rulesDir: path.join(repoPath, ".windsurf", "rules"),
        excludeRel: [".windsurf/skills", ".windsurf/workflows", ".windsurf/rules"],
      };
    },
  },

  "gemini-cli": {
    id: "gemini-cli",
    label: "Gemini CLI (Standalone)",
    mode: "convert",
    description: "Skills in ~/.gemini/skills, /commands in ~/.gemini/commands, MCP in ~/.gemini/settings.json, Rules in ~/.gemini/GEMINI.md",
    capabilities: { skills: true, mcp: true, rules: true, agents: false, hooks: false },
    match: /\bgemini[-_\s]*cli\b/i,
    exeNames: ["gemini"],
    resolvePaths(home = getHomeDir()) {
      const gemDir = path.join(home, ".gemini");
      return {
        primary: path.join(gemDir, "skills"),
        skills: path.join(gemDir, "skills"),
        commandsDir: { dir: path.join(gemDir, "commands"), suffix: ".toml", format: "gemini-toml-command" },
        mcp: { file: path.join(gemDir, "settings.json"), format: "json", key: "mcpServers" },
        rules: { file: path.join(gemDir, "GEMINI.md"), format: "inline-block" },
      };
    },
    resolveProjectPaths(repoPath) {
      return {
        skills: path.join(repoPath, ".gemini", "skills"),
        commandsDir: { dir: path.join(repoPath, ".gemini", "commands"), suffix: ".toml", format: "gemini-toml-command" },
        rules: { file: path.join(repoPath, "GEMINI.md"), format: "inline-block" },
        excludeRel: [".gemini/skills", ".gemini/commands"],
      };
    },
  },

  cline: {
    id: "cline",
    label: "Cline (VS Code Extension)",
    mode: "convert",
    description: "Skills in ~/.cline/skills, /workflows in ~/Documents/Cline/Workflows, MCP in cline_mcp_settings.json, Rules in ~/Documents/Cline/Rules",
    capabilities: { skills: true, mcp: true, rules: true, agents: false, hooks: false },
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
      };
    },
    resolveProjectPaths(repoPath) {
      return {
        skills: path.join(repoPath, ".cline", "skills"),
        rulesDir: path.join(repoPath, ".clinerules"),
        excludeRel: [".cline/skills"],
      };
    },
  },

  "roo-code": {
    id: "roo-code",
    label: "Roo Code",
    mode: "convert",
    description: "Skills in ~/.roo/skills, /commands in ~/.roo/commands, MCP in rooveterinaryinc.roo-cline mcp_settings.json, Rules in ~/.roo/rules",
    capabilities: { skills: true, mcp: true, rules: true, agents: false, hooks: false },
    match: /\b(roo|roo-code|roo-cline)\b/i,
    exeNames: ["roo"],
    resolvePaths(home = getHomeDir(), appData = getAppDataDir(home)) {
      const storage = path.join(appData, "Code", "User", "globalStorage", "rooveterinaryinc.roo-cline", "settings");
      return {
        primary: path.join(home, ".roo", "skills"),
        skills: path.join(home, ".roo", "skills"),
        commandsDir: { dir: path.join(home, ".roo", "commands"), suffix: ".md", format: "markdown-command" },
        mcp: { file: path.join(storage, "mcp_settings.json"), format: "json", key: "mcpServers" },
        rulesDir: { dir: path.join(home, ".roo", "rules"), suffix: ".md" },
      };
    },
    resolveProjectPaths(repoPath) {
      return {
        skills: path.join(repoPath, ".roo", "skills"),
        commandsDir: { dir: path.join(repoPath, ".roo", "commands"), suffix: ".md", format: "markdown-command" },
        rulesDir: path.join(repoPath, ".roo", "rules"),
        excludeRel: [".roo/skills", ".roo/commands", ".roo/rules"],
      };
    },
  },

  kiro: {
    id: "kiro",
    label: "Kiro (AWS)",
    mode: "convert",
    description: "Skills in ~/.kiro/skills, MCP in ~/.kiro/settings/mcp.json, Steering rules in ~/.kiro/steering",
    capabilities: { skills: true, mcp: true, rules: true, agents: false, hooks: false },
    match: /\bkiro\b/i,
    exeNames: ["kiro"],
    resolvePaths(home = getHomeDir()) {
      const kiroDir = path.join(home, ".kiro");
      return {
        primary: path.join(kiroDir, "skills"),
        skills: path.join(kiroDir, "skills"),
        mcp: { file: path.join(kiroDir, "settings", "mcp.json"), format: "json", key: "mcpServers" },
        rulesDir: { dir: path.join(kiroDir, "steering"), suffix: ".md" },
      };
    },
    resolveProjectPaths(repoPath) {
      return {
        skills: path.join(repoPath, ".kiro", "skills"),
        rulesDir: path.join(repoPath, ".kiro", "steering"),
        excludeRel: [".kiro/skills", ".kiro/steering"],
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
    return {
      id: p.id,
      label: p.label,
      mode: p.mode,
      description: p.description,
      capabilities: p.capabilities,
      defaultConfigPath: resolved.primary,
      paths: {
        primary: resolved.primary,
        skills: resolved.skills || resolved.bundle || null,
        commands: resolved.commandsDir?.dir || null,
        mcp: resolved.mcp?.file || (p.mode === "bundle" ? `${resolved.bundle}/*` : null),
        rules: resolved.rules?.file || resolved.rulesDir?.dir || (p.mode === "bundle" ? `${resolved.bundle}/*` : null),
        agents: (typeof resolved.agents === "object" ? resolved.agents?.dir : resolved.agents) || resolved.agentsDir?.dir || (p.mode === "bundle" ? `${resolved.bundle}/*` : null),
      },
    };
  });
}
