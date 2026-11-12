# Changelog

All notable changes to the Agent Space Manager plugin and its integrated components will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.1] - 2026-11-12

### Changed
- **Copy Prompt Duplicate Naming Rule (`page/app.js`)**: Updated the Copy Prompt specification and Rule Invariant 1 to disambiguate coincidental duplicate component names by appending `-1`, `-2`, etc. sequentially (`<name>-1`, `<name>-2`).

---

## [1.0.0] - 2026-11-12

### Added
- **Unified Single-Folder Component Management**: Centralized management for all AI component types (**Plugins, MCP Servers, Hooks, Skills, Subagents, and Rules**) in a single Components Storage Path (`~/AI-Agent-Space` or custom directory), with zero file duplication into agent default config folders.
- **Universal Multi-Agent Bridging (13 Built-In Profiles + Custom)**: Native format adaptation and OS junction/symlink linking for Antigravity, Claude Code, Codex CLI, OpenCode, VS Code / GitHub Copilot, Cursor AI, Windsurf, Gemini CLI, Cline, Roo Code, Kiro, Universal (`~/.agents/skills`), and Custom agents.
- **Auto-Detection & Per-Component Target Overrides**: Automatic config path discovery via filesystem probes, executables/shortcuts, environment variables, and CLI tools, plus customizable destination paths for Bundles, Skills, Slash Commands, MCPs, Rules, Subagents, and Hooks.
- **Expandable Discovered Components Registry**: 7-tab category browser (`All`, `Plugins`, `MCPs`, `Hooks`, `Skills`, `Agents`, `Rules`) with live search and 6-type component metrics tiles.
- **Per-Agent & Per-Project Overrides**: Drag-and-drop IDE/project reordering, project `Clone / Fork`, `.git/info/exclude` protection, `Expand All Files`, live `Rescan Hub` & `Connect` progress modals, and `● Agent Status` workability indicators with slash command (`/`) and `@` mention detection.
- **Foreign Components Detection & Cleanup**: Scans connected agent default directories for unmanaged components and provides interactive keep/delete cleanup.
- **Startup Snapshot Fingerprinting & Auto-Reconnect**: SHA-256 canonical storage hashing to detect external changes on startup and automatically re-sync connected agents.
- **Centralized Weekly Upstream Checking**: Monday startup upstream update checks and automatic pruning of decentralized update scripts (`update_checker.mjs`, `update_check_state.json`).
- **Smart Middleware Tool Gateway & OmniRoute Integration**: Intent-based tool filtering (`smart-tools.middleware.js`) with configurable tool cap (`10–256`, default `96`), failure diagnostics (`error.log`, `LAST_ERROR.json`, `STATUS.md`), and OmniRoute port `20128` status capsule.
- **Non-Destructive Ownership & Safety Invariants**: `.asm-owned.json` markers, `~/.agent-space-manager/state/<id>.json` tracking, atomic `.asm-bak` backups, 0-byte/`{}` config sanitization, GUI editor process protection, and WebView2-safe two-step inline confirmations.
- **Plugin Version Badge & Marketplace Publishing**: Displayed `V1.0.0` badge beside the plugin title and added GitHub Actions workflow (`.github/workflows/publish.yml`) for automated testing and npm marketplace publishing.

---

# Prompt Text Changelog

This section tracks all revisions to the standardized instructions copied via the **Copy Prompt** button in the Agent Space Manager dashboard.

## [V1.0] - 2026-10-31

### Features & Invariants
- **Version Identifier**: Added explicit version tag `[Components Storage Specification & Upstream Rules Prompt V1.0]` at the header of the copied prompt text.
- **Standard Plugin Directory Structure**: Defined standard directory layout:
  ```
  plugins/<plugin-name>/
  ├── plugin.json       # Required manifest (must contain "upstream" URL)
  ├── mcp_config.json   # Optional MCP server definitions
  ├── hooks.json        # Optional hooks definition
  ├── skills/           # Optional skills directory
  ├── agents/           # Optional subagent definitions
  └── rules/            # Optional rules directory
  ```
- **Mandatory Upstream Source Links**: Enforced that all components record the official upstream source repository or registry URL:
  - `plugin.json`: `"upstream": "https://github.com/<owner>/<repo>"`
  - `SKILL.md`: `upstream: "https://github.com/<owner>/<repo>"` in YAML frontmatter
  - Rules (`*.md`): `upstream: "https://github.com/<owner>/<repo>"` in YAML frontmatter
  - Agents (`*.md`): `upstream: "https://github.com/<owner>/<repo>"` in YAML frontmatter
- **Centralized Weekly Monday Checking**: Directed the agent to remove and prohibit local, decentralized update checking scripts (`update_checker.mjs`, `update_check_state.json`), relying on Agent Space Manager's centralized Monday startup update cycle.
- **Persistent Rule Installation**: Instructed the user's AI agent to persist a dedicated rule (`.agents/rules/components-storage-upstream-rule.md` or `.cursor/rules/components-storage-upstream-rule.mdc`) triggered whenever an addendum or edit is performed in the Components Storage Path.
- **Dashboard UI Display**: Updated the dashboard copy button to display `Copy Prompt (V1.0)`.
