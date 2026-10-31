# Changelog

All notable changes to the Agent Space Manager plugin and its integrated components will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.2.0] - 2026-10-31

### Added
- **Centralized Weekly Upstream Checking**: Added centralized update checking for all components in Components Storage Path via `/api/central-update-check` and startup hooks, running once per week on Monday cycles whenever Magpie boots up.
- **Decentralized Updater Pruning**: Added `removeComponentUpdateMechanisms()` to automatically find and purge legacy or decentralized update scripts (`update_checker.mjs`, `update_check_state.json`) from component directories.
- **Copy Prompt Versioning**: Introduced versioned prompt specification (`V1.0`) with dynamic label display on the copy button (`Copy Prompt (V1.0)`).
- **Persistent Agent Upstream Rule**: Installed [`.agents/rules/components-storage-upstream-rule.md`](.agents/rules/components-storage-upstream-rule.md) enforcing standard plugin directory layouts, mandatory upstream source links, and centralized Monday update checking on all component addendums and edits.
- **On-Disk Physical Workability Verification**: Added `verifyPluginWorkabilityOnDisk()` to verify physical directory and file presence before confirming agent readiness.
- **Workability Status Dots & Quick Actions**: Added green/red interactive status indicators and auto-detection of slash commands and `@` mentions for enabled components.
- **Components Storage Snapshot Fingerprinting**: SHA-256 canonical hashing of component storage directories to automatically detect external additions, edits, or removals and auto-reconnect configured agents on startup.

### Changed
- **Copy Prompt Button**: Display now shows `Copy Prompt (V1.0)` with automated 2-second copy feedback state and reset handling.
- **Plugins Cache Hygiene**: Sanitized fallback plugins cache to keep machine paths isolated and avoid repo pollution.

### Fixed
- **Universal Components Path Discovery**: Fixed `⚠️ Directory not found or contains 0 components` error across all path variants entered into Components Storage Path (`#hubPathInput`), including paths with surrounding double/single quotes, trailing slashes, single plugin folders, standalone skills directories, and direct multi-component roots.
- **Magpie Host Scan API Alignment**: Exposed `scanPlugins` alongside `getPlugins` in plugin IPC API (`index.mjs`) and added IPC fallbacks and 10000ms fetch timeout guards in `page/app.js`.
- **Packaging Cache Match Invariant**: Relaxed fallback matching in `apiClient.getPlugins` to align clean empty path baselines (`path: ""`) with default hub storage directories and cached components.
- **NTFS Reparse Point Compatibility**: Materialized real physical directories for Antigravity plugin bundles on Windows to bypass Go runtime `os.ReadDir` junction traversal issues.
- **Config Sanitization**: Proactively pruned 0-byte JSON files and empty `{}` stubs lacking required `"id"` fields to eliminate background Language Server crash loops.

---

## [1.1.0] - 2026-10-25

### Added
- **Universal Cross-Platform Resolution**: Added support for standard XDG, macOS Application Support, and Windows AppData directory resolutions across all agents.
- **Two-Step Non-Blocking Confirmations**: Replaced synchronous native browser dialogs with 2-step inline button confirmations with auto-reset timers for WebView2 and desktop host stability.
- **Process Protection Invariant**: Prohibited forceful `taskkill /F` and `SIGKILL` signals against primary GUI code editors (Antigravity, Cursor, Windsurf, VS Code, OpenCode).

### Changed
- Decoupled configuration saving (`saveHubConfig`) from active bridge generation (`connectAgent`).

---

## [1.0.0] - 2026-10-18

### Added
- **Universal Multi-Agent Bridging**: Initial release supporting 13+ AI environments (Antigravity, Claude Code, Cursor, Windsurf, VS Code Copilot, Codex CLI, OpenCode, Kiro, Cline, Roo Code).
- **Smart Middleware Gateway**: Intent-based tool filtering and configurable tool caps (default: 96) protecting LLM context windows against tool bloat.
- **Git Exclude Protection**: Automatic synchronization of bridged directories into `.git/info/exclude`.
- **Atomic Backups & Ownership Tracking**: Implemented `.asm-owned.json` manifests and `.asm-bak` backups to preserve user-owned files.

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

