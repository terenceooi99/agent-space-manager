---
trigger: always_on
description: "Master index and universal safety invariants for multi-IDE component orchestration, crash avoidance, and schema sanitization in Agent Space Manager"
---

# Agent Space Manager: Universal Safety Invariants & Architecture Master Index

## Executive Summary
Agent Space Manager orchestrates and bridges developer assets (skills, rules, MCP servers, subagents, and hooks) across 13+ diverse AI agent environments (including Google Antigravity, Cursor, Windsurf, Claude Code/Desktop, OpenCode, VS Code Copilot, Codex CLI, Cline, Roo Code, and Kiro).

Because each AI agent possesses distinct runtime architectures, configuration schemas, and memory indexing engines, bridging components without rigorous guards risks editor crashes, schema rejections, language server crash loops, and loss of unsaved developer progress.

The safety philosophy of Agent Space Manager is grounded in four fundamental pillars:
1. **Hot-Reload Dynamic Discovery**: Modern AI coding environments watch filesystem directories in real time; terminating primary GUI editors is prohibited and unnecessary.
2. **Strict Schema & Configuration Sanitization**: 0-byte stubs and incomplete object definitions crash background Language Server Protocol (LSP) daemons; directories must be actively sanitized.
3. **Non-Destructive Ownership & User Data Isolation**: Hub-managed assets are explicitly tracked via `.asm-owned.json` and `.asm-state/`; pre-existing user configurations are protected with atomic `.asm-bak` backups and delimiter blocks.
4. **Desktop UI Stability**: Desktop webviews suppress synchronous script dialogs; all user interactions must use non-blocking two-step inline confirmations.

---

## Master Navigation Matrix

| Invariant | Topic | Specification File | Scope / Target Agents | Key Avoidance Mechanism |
|---|---|---|---|---|
| **Invariant 1** | **Process Safety & Editor Protection** | [`process-termination.md`](process-termination.md) | Antigravity, Cursor, Windsurf, VS Code, OpenCode, Kiro, Cline | Never terminate primary GUI editors; hot-reload dynamic updates |
| **Invariant 2** | **Configuration & Schema Sanitization** | [`config-sanitization.md`](config-sanitization.md) | All agents, Language Servers, Project Managers | Delete 0-byte & `{}` stubs; atomic writes with `.asm-bak` |
| **Invariant 3** | **Rule Normalization & Metadata Triggers** | [`rule-normalization.md`](rule-normalization.md) | Antigravity (Cortex), Cursor, Claude Code, Windsurf, OpenCode | Mandatory YAML frontmatter `trigger: always_on`; delimiter blocks |
| **Invariant 4** | **Cross-Agent MCP Schema Compatibility** | [`mcp-schema-guards.md`](mcp-schema-guards.md) | Claude, Cursor, Windsurf, VS Code Copilot, OpenCode, Codex | Copilot `servers` key, OpenCode schema transform, TOML tables |
| **Invariant 5** | **Desktop WebView2 & Electron UI Safety** | [`webview2-dialogs.md`](webview2-dialogs.md) | Magpie Desktop Host, WebView2, Electron | Zero native browser dialogs; 2-step inline confirmations |
| **Invariant 6** | **Junction Lifecycle & Materialization** | [`junction-lifecycle.md`](junction-lifecycle.md) | Antigravity (Go runtime), Windows NTFS, Unix symlinks | Materialize real directories on Windows; `.asm-owned.json` tracking |
| **Invariant 7** | **Watcher Throttling & I/O Protection** | [`watcher-throttling.md`](watcher-throttling.md) | Background watchers, Daemons, Magpie IPC | >= 1000ms polling, 2000ms debounce; canonical SHA-256 fingerprinting |

---

## Topic Summaries & Directives

### 1. Process Protection & GUI Editor Lifecycle ([`process-termination.md`](process-termination.md))
- **Directive**: NEVER execute `taskkill /F`, `taskkill /T`, `pkill -9`, or equivalent ungraceful termination against primary GUI code editors (`antigravity.exe`, `cursor.exe`, `windsurf.exe`, `code.exe`, `opencode.exe`).
- **Rationale**: GUI editors hot-reload configuration changes from disk. Terminating active editors discards unsaved editor buffers, corrupts Electron User Data `SingletonLock` files, and leaves orphaned LSP daemons holding database locks.
- **Reference**: `manager.mjs:1501-1570`.

### 2. Configuration & Schema Sanitization ([`config-sanitization.md`](config-sanitization.md))
- **Directive**: NEVER write 0-byte JSON files or empty `{}` stubs missing mandatory `"id"` fields into agent configuration folders (`projects/`, `workspaces/`, `settings/`).
- **Rationale**: Antigravity's project scanner and Language Servers throw unhandled `SyntaxError: Unexpected end of JSON input` or `TypeError` crashes when reading 0-byte files or stubs lacking `"id"`.
- **Reference**: `manager.mjs:1074-1120`, `tests/detect.test.mjs:56-85`.

### 3. Rule Normalization, Metadata Triggers & Syntax Guards ([`rule-normalization.md`](rule-normalization.md))
- **Directive**: Every rule synchronized to metadata-driven agents MUST include valid YAML frontmatter with `trigger: always_on` and a clean, single-line description.
- **Rationale**: Google Antigravity's Cortex memory engine crashes with `CORTEX_MEMORY_TRIGGER_UNSPECIFIED` if the `trigger:` property is omitted. For monolithic rule files (`CLAUDE.md`, `AGENTS.md`), rules must be strictly isolated within managed delimiter blocks (`<!-- agent-space-manager:start -->`).
- **Reference**: `adapters.mjs:922-957`.

### 4. Cross-Agent MCP Schema Compatibility & Key Normalization ([`mcp-schema-guards.md`](mcp-schema-guards.md))
- **Directive**: Normalize MCP root keys and schemas to match target agent expectations (e.g., `"servers"` for VS Code Copilot, `"mcp"` with `{ type: "local", command: [...], environment: { ... } }` for OpenCode, and TOML tables `[mcp_servers.<name>]` for Codex CLI).
- **Rationale**: VS Code Copilot silently ignores servers under the standard `"mcpServers"` key. OpenCode's Effect Schema rejects standard command/args splits. Codex CLI requires valid TOML syntax.
- **Reference**: `agents.mjs:195`, `adapters.mjs:655-686`.

### 5. Desktop WebView2 & Electron UI Interaction Standards ([`webview2-dialogs.md`](webview2-dialogs.md))
- **Directive**: NEVER execute `window.confirm()`, `window.alert()`, or `window.prompt()` in frontend interfaces.
- **Rationale**: Desktop webviews (such as Magpie Microsoft Edge WebView2) suppress synchronous modal dialogs by default, returning `false` immediately and causing destructive actions to silently fail. All destructive actions must employ two-step inline confirmation buttons with a 4-second auto-reset timer.
- **Reference**: `page/app.js:1204-1218`, `1350-1364`.

### 6. Junction Lifecycle, Directory Materialization & Ownership Tracking ([`junction-lifecycle.md`](junction-lifecycle.md))
- **Directive**: On Windows, materialize real directories (`fs.mkdirSync`) for Antigravity plugin bundles and skills instead of top-level NTFS directory junctions, and verify `.asm-owned.json` before deleting directories.
- **Rationale**: Go's standard library `os.ReadDir` on Windows evaluates NTFS junctions as non-directories (`IsDir() == false`), causing Antigravity to silently ignore junctioned plugins. Running recursive deletes on junctions can traverse links and erase original hub repositories.
- **Reference**: `adapters.mjs:251-346`, `tests/sync-bundle.test.mjs:104-133`.

### 7. File Watcher Throttling, Debounce & Descriptor Protection ([`watcher-throttling.md`](watcher-throttling.md))
- **Directive**: Enforce minimum 1000ms polling rates (baseline: >= 2000ms), 500ms-2000ms debounce windows, `.unref()` on all background timer handles, and deterministic SHA-256 snapshot checking.
- **Rationale**: Unthrottled file watchers create I/O feedback storms with IDE Language Servers, exhausting operating system file descriptors (`EMFILE`) and causing test runners to hang.
- **Reference**: `server.mjs:173-178`, `manager.mjs:1732-1960`.

---

## Universal Rules for Contributors & Autonomous AI Agents
When extending Agent Space Manager, contributing adapters, or operating autonomously within this repository:

1. **Test Sandbox Isolation**:
   - Always run unit and integration tests with `ASM_TEST=1` and `NODE_ENV=test`.
   - Never remove or bypass test sandbox guards.
2. **User File Preservation**:
   - Never delete or overwrite files or directories that lack `.asm-owned.json` or are not tracked in `.asm-state/<ownerId>.json`.
3. **Atomic Modification with `.asm-bak`**:
   - Always verify that pre-existing configuration files have an active `.asm-bak` backup before applying changes.
4. **Command Token Optimization**:
   - Prefix terminal execution commands with `rtk` (e.g., `rtk npm test`) in accordance with repository guidelines.
