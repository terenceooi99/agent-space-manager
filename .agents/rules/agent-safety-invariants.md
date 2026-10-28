---
trigger: always_on
description: "Universal safety invariants for multi-IDE component orchestration, process protection, and schema sanitization in Agent Space Manager"
---

# Agent Space Manager: Safety & Bridging Invariants

When developing, refactoring, or adding adapters to Agent Space Manager, all agents and contributors MUST adhere to these strict invariants:

## 1. Process Termination Invariant (Never Kill Primary GUI IDEs)
- **Zero Forceful Kills:** NEVER execute `taskkill /F` or `pkill -9` against primary GUI code editors (`antigravity.exe`, `cursor.exe`, `windsurf.exe`, `code.exe`, `opencode.exe`, etc.).
- **Hot-Reload Preference:** All modern AI IDEs hot-reload skills, plugins, rules, and MCP configurations on disk dynamically. Component unlinking must NEVER terminate active editor windows or discard unsaved developer work.
- **Graceful Auxiliaries Only:** Process killing is restricted strictly to dedicated, headless auxiliary background daemons (e.g. sidecars) and only when explicitly opted in (`killProcesses === true`).
- **Test Sandbox Isolation:** Unit tests must ALWAYS run with `ASM_TEST=1` and `NODE_ENV=test` to guarantee real operating system processes are never targeted during test runs.

## 2. Configuration & Schema Sanitization Invariant
- **No Empty Stub Files:** NEVER write blank JSON objects `{}` or 0-byte stub files into agent configuration directories (such as `projects/`, `workspaces/`, or `settings/`).
- **Required Identity Fields:** If creating a project manifest, verify required identifiers (e.g., non-empty `"id"`, `"name"`) exist before writing to disk.
- **Automated Directory Sanitization:** Always execute `sanitizeAgentConfigDirectory()` before and after sync operations to prune orphaned 0-byte files and invalid stubs before Language Servers parse them.
- **Atomic Writes & Backups:** Always create `.asm-bak` backups prior to modifying user configuration files (`~/.claude.json`, `mcp.json`, `config.toml`, `settings.json`).

## 3. Rule Normalization Invariant
- **Mandatory Frontmatter:** Any rule file copied or synchronized to an agent with Cortex or metadata engines (like Antigravity) MUST include valid YAML frontmatter:
  ```yaml
  ---
  trigger: always_on
  description: "Descriptive summary"
  ---
  ```
- **Syntax Guard:** Missing triggers default to `trigger: always_on` to prevent `CORTEX_MEMORY_TRIGGER_UNSPECIFIED` parser failures.

## 4. Desktop WebView2 UI Interaction Invariant
- **Zero Native Browser Dialogs:** NEVER use `window.confirm()`, `window.alert()`, or `window.prompt()` in Magpie WebView2 / Electron UI pages. Desktop webview hosts suppress native script dialogs by default, causing actions to silently abort.
- **Two-Step Inline Confirmations:** Use non-blocking, two-step inline button states (e.g., `"Remove"` -> `"Click to Confirm"`, with a 4-second auto-reset timer) or custom HTML modal dialogs for all destructive operations.

## 5. Junction & Link Lifecycle Invariant
- **Clean Unlinking:** When deactivating or unlinking components, prune dangling junctions, broken links, and empty ghost directories (`fs.rmSync(dir, { recursive: true, force: true })`).
- **Preserve User Files:** Never delete or overwrite directories or files not marked with `.asm-owned.json` or tracked in ownership state.

## 6. Watcher & I/O Throttling Invariant
- **Polling Rate Limits:** Background configuration watchers must never poll faster than 1000ms (standard: 2000ms) with debounce to avoid disk churn and Language Server file-watcher exhaustion.
