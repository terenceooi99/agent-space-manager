---
trigger: always_on
description: "Process termination safety invariants: strict protection of primary GUI IDE editors from forceful termination and graceful handling of background daemons"
---

# Safety Invariant 1: Process Protection & GUI Editor Lifecycle

## Core Avoidance Mechanism
Never forcefully kill running primary GUI code editors or AI IDE environments. All component additions, unlinking, updates, and configuration adjustments in Agent Space Manager must rely on dynamic filesystem hot-reloading rather than operating system process termination.

---

## 1. Zero Forceful Kills Invariant
- **Prohibited Commands**: Never execute `taskkill /F`, `taskkill /T`, `pkill -9`, `kill -9`, or equivalent ungraceful `SIGKILL` signals against any primary GUI code editor or IDE.
- **Protected GUI Agents**:
  - Google Antigravity (`antigravity`, `agy`)
  - Cursor AI (`cursor`)
  - Windsurf / Codeium (`windsurf`)
  - Visual Studio Code / GitHub Copilot (`vscode`, `code`, `vscode-copilot`)
  - VSCodium (`vscodium`, `codium`)
  - OpenCode (`opencode`)
  - Kiro (`kiro`)
  - Gemini CLI standalone (`gemini-cli`)
  - Cline & Roo Code (`cline`, `roo-code`)
- **Protected Executables**:
  - `antigravity.exe`, `antigravity ide.exe`, `agy.exe`
  - `cursor.exe`, `windsurf.exe`
  - `code.exe`, `codium.exe`, `vscodium.exe`
  - `opencode.exe`, `electron.exe`, `devenv.exe`, `idea64.exe`

---

## 2. Why Process Termination Causes Crashes and Corruption
Terminating primary GUI editors via process management tools induces catastrophic failure modes across agent workspaces:

1. **Unsaved Developer State & Buffer Loss**: Force-killing abruptly drops active memory buffers, dirty text editors, undo/redo trees, and uncommitted multi-file agent diffs.
2. **Orphaned Language Servers & File Locks**: Modern AI IDEs spawn background language servers (`gopls`, `pyright`, `tsserver`, `rust-analyzer`), Cortex memory indexers, and code-graph daemon watchers. Terminating the parent GUI process leaves orphaned background workers holding exclusive file locks on SQLite workspace state (`state.vscdb`), shared memory segments, and named pipes.
3. **Chromium & Electron SingletonLock Collisions**: Electron and Chromium-based editors place a `SingletonLock` symlink or `SingletonCookie` file in their User Data directory. Abrupt termination bypasses application exit hooks (`app.on('will-quit')`), leaving dangling lockfiles on disk. Subsequent launches fail with "Another instance of the app is running" or hang at a blank window.
4. **Desktop Host Jarring**: In embedded multi-window host environments (such as Magpie WebView2 desktop shells), sudden process death breaks native IPC pipes, corrupts window frame docking, and causes host crashes.

---

## 3. Dynamic Hot-Reload Preference
Modern AI IDEs dynamically observe their configuration and rule directories:
- Antigravity: `~/.gemini/config/` (plugins, skills, rules, MCP)
- Cursor: `~/.cursor/` and `.cursor/rules/`
- Windsurf: `~/.codeium/windsurf/`
- OpenCode: `~/.config/opencode/`
- Claude Code / Desktop: `~/.claude/` and `~/.claude.json`

File watching APIs (`ReadDirectoryChangesW`, `inotify`, `FSEvents`, `chokidar`) detect when a component link, skill manifest, rule markdown file, or MCP definition is added or updated. The IDE immediately updates its active tool catalog and prompt memory in real time without requiring a restart.

---

## 4. Graceful Auxiliaries Only
- Process termination is restricted strictly to dedicated, headless auxiliary background daemons (e.g. mock server bridges, local test sidecars, background sync utilities) and **ONLY** when explicitly requested via `killProcesses === true`.
- If an auxiliary background daemon must be stopped, use graceful signals only:
  - **Windows**: `taskkill /IM "${procName}"` (**NEVER** `/F` or `/T`).
  - **Unix / macOS**: `pkill -f "${procName}"` (**NEVER** `-9`).

---

## 5. Test Sandbox Isolation Invariant
- Unit and integration tests must run in isolated test sandboxes where process killing is completely neutralized:
  ```bash
  ASM_TEST=1
  NODE_ENV=test
  ```
- In `manager.mjs`:
  ```javascript
  if (process.env.NODE_ENV === "test" || process.env.ASM_TEST === "1") {
    return { success: true, skipped: "test-environment" };
  }
  ```
- This ensures test suites running locally or in CI pipelines never target, disrupt, or terminate real operating system processes.

---

## 6. Implementation Reference (`manager.mjs:1501-1570`)
```javascript
const PROTECTED_GUI_AGENTS = new Set([
  "antigravity", "cursor", "windsurf", "vscode", "vscode-copilot",
  "vscodium", "opencode", "kiro", "gemini-cli", "cline", "roo-code",
]);

const PROTECTED_EXECUTABLES = new Set([
  "antigravity.exe", "antigravity ide.exe", "agy.exe", "cursor.exe",
  "windsurf.exe", "code.exe", "codium.exe", "vscodium.exe",
  "opencode.exe", "electron.exe", "devenv.exe", "idea64.exe",
]);

export async function killAgentProcesses(ideEntry, options = {}) {
  const normalized = normalizeIdeEntry(ideEntry);
  const type = String(normalized.agentType || normalized.id || "").toLowerCase();

  // Test sandbox bypass
  if (process.env.NODE_ENV === "test" || process.env.ASM_TEST === "1") {
    return { success: true, skipped: "test-environment" };
  }

  // Hot-reload bypass for GUI editors
  if (PROTECTED_GUI_AGENTS.has(type) && !normalized.forceKill) {
    return { success: true, skipped: "gui-editor-hot-reload-protected" };
  }
  // ...
}
```
