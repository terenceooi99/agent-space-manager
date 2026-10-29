# Milestone 1 Technical Report: Modular Safety Invariants (Part 2)
**Investigator**: `teamwork_explorer_m1_2`  
**Working Directory**: `d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_explorer_m1_2`  
**Date**: 2026-10-29  
**Status**: Investigation Complete & Technical Rule Specifications Formulated  

---

## 1. Executive Summary

This report delivers the architectural investigation and definitive technical content for the second set of modular safety invariant rule files for Agent Space Manager:
1. **`mcp-schema-guards.md`**: MCP Server Schema Compatibility across diverse AI agents (VS Code Copilot, OpenCode, Claude Code/Desktop, Cursor, Codex CLI, Windsurf, Antigravity, Cline, Roo Code, Kiro).
2. **`webview2-dialogs.md`**: Desktop WebView2 Dialog Suppression & Non-Blocking UI Invariants (Zero native dialogs, two-step inline confirmations with auto-reset timers, accessible non-blocking modals).
3. **`junction-lifecycle.md`**: Junction & Link Lifecycle, Clean Unlinking, Windows Go `os.ReadDir` NTFS Junction Bug Avoidance (Real-directory materialization for Antigravity), and Non-Owned User Data Preservation.
4. **`watcher-throttling.md`**: Configuration Watcher Throttling, Polling Rate Limits (>= 2000ms), Debounce Windows, and File Descriptor Exhaustion Avoidance.

Every rule specification conforms to Agent Space Manager's mandatory YAML frontmatter standard (`trigger: always_on`), provides concrete code citations from the current codebase (`adapters.mjs`, `manager.mjs`, `agents.mjs`, `server.mjs`, `page/app.js`, and `tests/`), and provides turnkey, copy-ready markdown content for `.agents/rules/`.

---

## 2. Topic 4 Investigation: MCP Server Schema Guards (`mcp-schema-guards.md`)

### 2.1 Codebase & Upstream Agent Analysis

AI Coding Agents have fragmented around different MCP configuration schemas and storage strategies. If Agent Space Manager writes a configuration using an incompatible root key or schema structure, the target agent either crashes upon parsing or silently ignores the MCP server definitions entirely.

#### Matrix of Agent MCP Schemas:

| Agent / IDE | Configuration Path | Root Key | Command / Args Format | Remote URL Format | Environment Key |
|---|---|---|---|---|---|
| **Claude Desktop** | `%APPDATA%\Claude\claude_desktop_config.json` | `mcpServers` | `{ command: "cmd", args: [...] }` | `{ url: "https://..." }` | `env: { ... }` |
| **Claude Code** | Global: `~/.claude.json`, Project: `.mcp.json` | `mcpServers` | `{ command: "cmd", args: [...] }` | `{ url: "https://..." }` | `env: { ... }` |
| **VS Code Copilot** | Global: `Code/User/mcp.json`, Project: `.vscode/mcp.json` | **`servers`** *(NOT `mcpServers`)* | `{ command: "cmd", args: [...] }` | `{ url: "https://..." }` | `env: { ... }` |
| **OpenCode** | Global: `~/.config/opencode/opencode.json`, Project: `opencode.json` | **`mcp`** | **`{ type: "local", command: ["cmd", ...args], enabled: true }`** | **`{ type: "remote", url: "https://...", enabled: true }`** | **`environment: { ... }`** *(NOT `env`)* |
| **Codex CLI** | Global: `~/.codex/config.toml`, Project: `.codex/config.toml` | **`[mcp_servers.<name>]`** *(TOML table)* | `command = "..."` + `args = [...]` | `url = "..."` | `[mcp_servers.<name>.env]` |
| **Cursor AI** | Global: `~/.cursor/mcp.json`, Project: `.cursor/mcp.json` | `mcpServers` | `{ command: "cmd", args: [...] }` | `{ url: "https://..." }` | `env: { ... }` |
| **Windsurf** | Global: `~/.codeium/windsurf/mcp_config.json` | `mcpServers` | `{ command: "cmd", args: [...] }` | `{ url: "https://..." }` | `env: { ... }` |
| **Antigravity** | Global: `~/.gemini/config/mcp_config.json`, Project: `.agents/mcp_config.json` | `mcpServers` | `{ command: "cmd", args: [...] }` | `{ url: "https://..." }` | `env: { ... }` |
| **Gemini CLI** | Global: `~/.gemini/settings.json`, Project: `.gemini/settings.json` | `mcpServers` | `{ command: "cmd", args: [...] }` | `{ url: "https://..." }` | `env: { ... }` |
| **Cline / Roo Code** | Global: `Code/User/globalStorage/.../settings/` | `mcpServers` | `{ command: "cmd", args: [...] }` | `{ url: "https://..." }` | `env: { ... }` |
| **Kiro (AWS)** | Global: `~/.kiro/settings/mcp.json` | `mcpServers` | `{ command: "cmd", args: [...] }` | `{ url: "https://..." }` | `env: { ... }` |

### 2.2 Key Pitfalls & Avoidance Mechanisms

1. **Root Key Mismatch Crash/Ignore (VS Code Copilot)**:
   - *Observation*: VS Code Copilot requires `"servers": { ... }` in `Code/User/mcp.json` and `.vscode/mcp.json` (`agents.mjs:195,205`).
   - *Failure Mode*: If an adapter writes standard `"mcpServers"`, VS Code Copilot fails to recognize any servers, and if existing servers under `"servers"` are replaced, user configurations are destroyed.
   - *Rule Guard*: `syncJsonMcpServers` must strictly use `mcpSpec.key || "mcpServers"` (`adapters.mjs:686`).
2. **OpenCode Array Command & Environment Key Crash**:
   - *Observation*: OpenCode's schema parser strictly requires `type: "local"` or `type: "remote"` with `command: [cmd, ...args]` (a single array) and `environment: { ... }` (`adapters.mjs:655-677`).
   - *Failure Mode*: Writing `{ command: "npx", args: ["..."], env: { ... } }` into `opencode.json` causes OpenCode's JSON schema validator to throw a fatal error or crash the background OpenCode daemon.
   - *Rule Guard*: Always pass definitions through `toOpenCodeMcpEntry()` when target profile specifies `format: "opencode-json"`. Skip entries that have neither command nor URL.
3. **Codex CLI TOML Syntax Corruption**:
   - *Observation*: Codex uses TOML. Server names with dots, hyphens, or spaces (e.g. `alpha.mcp` or `beta-db`) will corrupt TOML AST parsing if written unquoted (`adapters.mjs:802`).
   - *Rule Guard*: Quote table keys if they contain characters outside `^[A-Za-z0-9_-]+$`. Enclose managed entries strictly between `# >>> agent-space-manager` and `# <<< agent-space-manager` comments.
4. **Preservation of User-Defined Servers & Non-Destructive Merging**:
   - *Observation*: Developers frequently configure private database or API MCP servers in `~/.claude.json` or `mcp.json` (`tests/sync-adapters.test.mjs:15-21,54`).
   - *Rule Guard*: Always create `.asm-bak` backup before mutating user configs. Merge into existing document. Only prune keys that are explicitly tracked in `.asm-state/<ownerId>.json`.

---

## 3. Topic 5 Investigation: Desktop WebView2 Dialog Suppression (`webview2-dialogs.md`)

### 3.1 Codebase & WebView2 Host Analysis

Agent Space Manager runs in multiple desktop execution environments:
- Embedded inside Magpie's host using Microsoft Edge WebView2 (`CoreWebView2`).
- Embedded inside Electron or Chromium desktop wrappers.
- Rendered in modern web browsers via the local HTTP server (`http://127.0.0.1:3901/page/`).

### 3.2 The WebView2 Dialog Suppression Pitfall

- **Default Behavior**: By default, WebView2 controls in desktop applications suppress native synchronous JavaScript dialogs (`window.alert()`, `window.confirm()`, `window.prompt()`) unless the native Win32 host explicitly implements and handles the `CoreWebView2.ScriptDialogOpening` event.
- **Silent Action Abort**: In Magpie WebView2, calling `window.confirm("Delete IDE?")` does NOT open a dialog; instead, it immediately returns `false` or `undefined` synchronously.
- **UI Freeze / Hang**: In some desktop embedding environments, calling a synchronous JavaScript dialog from an asynchronous event loop blocks the UI thread's message pump, causing the desktop window to freeze permanently.
- **Audit Findings in `page/app.js`**:
  - `page/app.js` has successfully deployed two-step inline confirmations for agent removal (lines 1204-1218) and project deletion (lines 1350-1364).
  - However, line 2294 and line 2331 still have residual `alert()` calls:
    - Line 2294: `alert("Please provide an Agent/IDE name and configuration path.");`
    - Line 2331: `alert("Please provide project name and repository path.");`
  - These residual alerts fail silently in Magpie WebView2, leaving users confused when form submission appears to do nothing.

### 3.3 Two-Step Inline Confirmation State Machine

The required pattern for all destructive UI operations (e.g., disconnecting an agent, removing a project, resetting configurations):

```
[ Normal State ]  ──(Click 1)──>  [ Confirming State ]  ──(Click 2)──>  [ Executing State ]
  "Remove"                         "Click to Confirm"                    "Removing..."
                                   (color: #ef4444)                      (disabled: true)
                                          │
                                   (4-sec Timeout)
                                          ▼
                                   [ Normal State ]
                                      "Remove"
```

```javascript
let confirmTimer = null;
btn.addEventListener("click", async (e) => {
  e.preventDefault();
  e.stopPropagation();

  // Step 1: Inline confirmation (immune to WebView2 modal suppression)
  if (btn.dataset.confirming !== "true") {
    btn.dataset.confirming = "true";
    btn.textContent = "Click to Confirm";
    btn.style.color = "#ef4444";
    btn.style.fontWeight = "bold";

    if (confirmTimer) clearTimeout(confirmTimer);
    confirmTimer = setTimeout(() => {
      delete btn.dataset.confirming;
      btn.textContent = "Remove";
      btn.style.color = "";
      btn.style.fontWeight = "";
    }, 4000);
    return;
  }

  // Step 2: Confirmed execution
  if (confirmTimer) clearTimeout(confirmTimer);
  delete btn.dataset.confirming;
  btn.disabled = true;
  btn.textContent = "Removing...";
  await performDestructiveAction();
});
```

---

## 4. Topic 6 Investigation: Junction & Link Lifecycle (`junction-lifecycle.md`)

### 4.1 The Windows Go `os.ReadDir` NTFS Junction Bug

#### Technical Mechanism:
- Google Antigravity is built with Go.
- On Windows, directory junctions are NTFS reparse points (`IO_REPARSE_TAG_MOUNT_POINT`).
- In Go's standard library `os.ReadDir(dir)` on Windows, directory entries are populated using the Win32 `FindNextFileW` API into `fs.DirEntry` objects.
- In Go, `DirEntry.IsDir()` returns `entry.Type().IsDir()`. For an NTFS directory junction, the `FILE_ATTRIBUTE_REPARSE_POINT` flag is set, which Go maps to `fs.ModeSymlink | fs.ModeIrregular`. Because Go does not automatically call `os.Stat` on directory entries during `os.ReadDir`, **`entry.IsDir()` returns `false`!**
- *Impact on Antigravity*: Antigravity scans `~/.gemini/config/plugins` and `~/.gemini/config/skills` using `entries := os.ReadDir(...)`. It filters entries with `if !entry.IsDir() { continue }`. Because junctions report `IsDir() == false`, Antigravity **completely ignores and skips all junctioned plugin bundles and flattened skills on Windows!**

#### The Agent Space Manager Solution: Real-Directory Materialization:
- Instead of creating a top-level junction for Antigravity plugin bundles or skills:
  - Agent Space Manager creates a **real NTFS directory** (`fs.mkdirSync`) at `~/.gemini/config/plugins/<plugin-name>` and `~/.gemini/config/skills/<skill-name>` (`adapters.mjs:251-346`).
  - It writes a tracking marker `.asm-owned.json` into the materialized directory.
  - It copies top-level files (`plugin.json`, `SKILL.md`) directly into the real directory.
  - For deep subdirectories, child junctions or materialized subdirectories are created.
  - When Antigravity calls `os.ReadDir()`, the directory has `FILE_ATTRIBUTE_DIRECTORY` without a top-level reparse point tag, so `entry.IsDir()` evaluates to `true`. Antigravity immediately discovers all plugins and slash commands!
- Verified in `tests/sync-bundle.test.mjs:104-133`:
  ```javascript
  const alphaStat = fs.lstatSync(alphaPluginDir);
  assert.equal(alphaStat.isDirectory(), true, "Must be a real directory so Go os.ReadDir sees IsDir() == true");
  assert.equal(alphaStat.isSymbolicLink(), false, "Must not be a top-level junction");
  assert.equal(fs.existsSync(path.join(alphaPluginDir, ".asm-owned.json")), true);
  ```

### 4.2 Safe Unlinking & Pruning Lifecycle

1. **Junction Unlink Invariant (Never Delete Source)**:
   - On Windows, `cmd.exe /c rmdir "${linkPath}"` must be used to unlink an NTFS directory junction (`manager.mjs:1016-1025`).
   - Running recursive directory deletion (`rm -rf` or `fs.rmSync(link, { recursive: true })`) on a junction can traverse the link and wipe the actual source files in the hub repository!
2. **Ownership Verification via `.asm-owned.json`**:
   - Before executing `fs.rmSync(dir, { recursive: true, force: true })` on any directory, verify that `isAsmOwnedDirectory(dir)` is `true` (i.e. `dir/.asm-owned.json` exists) or that the path is tracked in `.asm-state/<ownerId>.json` (`adapters.mjs:239-245,394-398`).
3. **Ghost Directory Pruning**:
   - Leftover empty directories in `plugins/` and `skills/` must be cleaned up via `sanitizeAgentConfigDirectory()` to prevent Language Server file-watcher bloat (`manager.mjs:1102-1119`).
4. **Preserving User-Owned Files**:
   - If a file or directory does not contain `.asm-owned.json` and its symlink target does not point into the hub (`isTargetInsideHub`), it is strictly preserved as user data.

---

## 5. Topic 7 Investigation: Configuration Watcher Throttling (`watcher-throttling.md`)

### 5.1 The Watcher Storm Problem

- In a multi-agent environment, multiple IDE instances (Cursor, VS Code, Windsurf, Antigravity) and background daemons run simultaneously.
- Each IDE attaches file-system watchers (`chokidar`, `ReadDirectoryChangesW`, `inotify`, `FSEvents`) to project and user configuration directories.
- If Agent Space Manager runs an aggressive, un-throttled polling loop (e.g. 100ms) or responds synchronously to every `fs.watch` event:
  1. File modifications by ASM trigger IDE watcher events.
  2. The IDE starts re-indexing or re-linting, touching temporary files.
  3. ASM detects changes in temporary files and triggers a full sync (`syncAllIdes`).
  4. An exponential I/O storm ensues, exhausting operating system file descriptors (`EMFILE: too many open files`), pinning CPU at 100%, and crashing the IDE.

### 5.2 Mandatory Invariants for Watchers

1. **Polling Rate Limits (>= 2000ms)**:
   - Background polling intervals must never be set below 1000ms. The project standard is fixed at **>= 2000ms** (`server.mjs:173-175`).
2. **Process Exit Guard (`.unref()`)**:
   - Every `setInterval` or `setTimeout` running in background daemons or watchers must call `.unref()` (`server.mjs:176-178`). This prevents dangling background timers from blocking Node process exit or causing unit tests to hang.
3. **Trailing-Edge Debounce (500ms - 1000ms)**:
   - File-change events from `fs.watch` must be debounced with a trailing-edge window of at least 500ms to consolidate rapid bursts of file writes (e.g. git checkouts or batch package installs) into a single sync operation.
4. **Zero-Work Timestamp / Hash Guarding**:
   - Before executing directory scanning (`scanPlugins`) or agent synchronization (`syncAllIdes`), check the target file's `mtimeMs` or SHA-256 hash against cached state. If unchanged, abort immediately without performing disk writes.
5. **High-Churn Directory Exclusion**:
   - Watchers must strictly exclude `.git/`, `node_modules/`, `.asm-state/`, `.agents/teamwork/`, and temporary backup files (`*.asm-bak`).

---

## 6. Recommended Modular Rule Content Specifications

Below are the exact, production-ready markdown documents designed to be written into `.agents/rules/`.

---

### Specification 4: `.agents/rules/mcp-schema-guards.md`

```markdown
---
trigger: always_on
description: "Cross-agent MCP server schema compatibility, root key transformations, and crash prevention invariants"
---

# Agent Space Manager: MCP Server Schema Guards & Cross-Agent Compatibility

When bridging, synchronizing, or updating Model Context Protocol (MCP) server definitions across supported AI coding agents and IDEs, adapters MUST adhere to these schema invariants to prevent syntax errors, schema rejections, and language server crashes.

## 1. Root Key Compatibility Invariant
Different agents expect distinct root keys in their native JSON configuration files:

- **Standard `mcpServers`**: Claude Desktop (`claude_desktop_config.json`), Claude Code (`~/.claude.json`, `.mcp.json`), Cursor (`~/.cursor/mcp.json`), Windsurf (`mcp_config.json`), Antigravity (`~/.gemini/config/mcp_config.json`), Gemini CLI (`settings.json`), Cline, Roo Code, and Kiro.
  ```json
  {
    "mcpServers": {
      "server-name": { "command": "npx", "args": ["-y", "@alpha/mcp-server"] }
    }
  }
  ```
- **VS Code / GitHub Copilot `servers`**: VS Code Copilot strictly requires the root key `"servers"` in `Code/User/mcp.json` and `.vscode/mcp.json`.
  ```json
  {
    "servers": {
      "server-name": { "command": "npx", "args": ["-y", "@alpha/mcp-server"] }
    }
  }
  ```
  *Guard*: Never write `"mcpServers"` into VS Code's `mcp.json`; Copilot will silently ignore all servers. Always resolve the root key from `profile.mcp.key`.

- **OpenCode `mcp`**: OpenCode strictly requires the root key `"mcp"` in `opencode.json` and `~/.config/opencode/opencode.json`.
  ```json
  {
    "mcp": {
      "server-name": {
        "type": "local",
        "command": ["npx", "-y", "@alpha/mcp-server"],
        "enabled": true
      }
    }
  }
  ```

## 2. Command & Arguments Transformation Invariant
- **Single Array `command` for OpenCode**: OpenCode local server definitions combine the executable and all arguments into a single string array under `"command"`, and use `"environment"` instead of `"env"`.
  - Standard input: `{ command: "npx", args: ["-y", "pkg"], env: { KEY: "VAL" } }`
  - OpenCode output: `{ type: "local", command: ["npx", "-y", "pkg"], environment: { KEY: "VAL" }, enabled: true }`
  - *Guard*: Passing split `command` and `args` to OpenCode violates its JSON schema and crashes the OpenCode daemon.
- **Null / Empty Command Guard**: If an MCP definition lacks both a valid executable `command` and a remote URL, it must NOT be written to disk. Never emit stub entries with `command: []` or `command: undefined`.

## 3. Remote Server URL Format Normalization
- Remote servers must be normalized across aliases (`url`, `serverUrl`, `httpUrl`):
  - Standard JSON: `{ "url": "https://..." }`
  - OpenCode: `{ "type": "remote", "url": "https://...", "enabled": true }`

## 4. Codex CLI TOML Block Invariant
Codex CLI stores MCP servers inside `config.toml` (`~/.codex/config.toml` or `.codex/config.toml`).
- Managed MCP servers must be synchronized exclusively within explicit block markers:
  ```toml
  # >>> agent-space-manager
  [mcp_servers.alpha-mcp]
  command = "npx"
  args = ["-y", "@alpha/mcp-server"]

  [mcp_servers."beta-db"]
  command = "uvx"
  args = ["mcp-sqlite", "--db", "test.db"]
  # <<< agent-space-manager
  ```
- Any table key containing non-alphanumeric characters (hyphens, dots, spaces) must be quoted to prevent TOML parsing crashes.
- User configurations outside the marker comments (e.g., `model = "gpt-5-codex"`) must never be modified or deleted.

## 5. Non-Destructive Merging & Atomic Backup Invariant
- Prior to modifying any agent's MCP configuration file, always create an atomic `.asm-bak` backup.
- Never overwrite or delete user-defined MCP servers. Only modify or prune servers tracked in the agent's ownership manifest (`.asm-state/<ownerId>.json`).
```

---

### Specification 5: `.agents/rules/webview2-dialogs.md`

```markdown
---
trigger: always_on
description: "Zero native browser dialogs in desktop WebView2, two-step inline confirmations, and non-blocking modal invariants"
---

# Agent Space Manager: Desktop WebView2 Dialog Suppression & Non-Blocking UI Invariants

When developing UI pages (`page/app.js`, `page/index.html`) or frontend components for Agent Space Manager, developers and agents MUST adhere to these non-blocking UI interaction invariants.

## 1. Zero Native Browser Dialogs Invariant
- **Never Call Native Dialogs**: NEVER execute `window.confirm()`, `window.alert()`, or `window.prompt()` in any frontend code.
- **Root Cause**: Desktop host containers (such as Magpie WebView2, Electron embedded webviews, and sandboxed iframes) suppress native script dialogs by default. When called:
  - `window.confirm()` immediately returns `false` or `undefined` without rendering a UI dialog, causing destructive operations to silently abort.
  - `window.alert()` fails silently, leaving validation errors and important notices invisible to the user.
  - In certain host configurations, synchronous script dialogs can deadlock the desktop application's Win32 message pump, freezing the window.

## 2. Two-Step Inline Confirmation State Machine
All destructive operations (such as disconnecting an agent, removing a project, or purging bridge links) MUST use a non-blocking, two-step inline confirmation pattern with an automatic reset timer:

```
[ Step 0: Idle ]      ──(Click 1)──>   [ Step 1: Confirming ]   ──(Click 2)──>   [ Step 2: Executing ]
Text: "Remove"                          Text: "Click to Confirm"                  Text: "Removing..."
Style: default                          Style: #ef4444 bold                       Disabled: true
Timer: none                             Timer: 4000ms active                      Action: Async API Call
                                               │
                                        (Timeout: 4000ms)
                                               ▼
                                       [ Step 0: Idle ]
```

### Reference Implementation:
```javascript
let confirmTimer = null;

button.addEventListener("click", async (e) => {
  e.preventDefault();
  e.stopPropagation();

  // Step 1: Enter confirmation prompt state
  if (button.dataset.confirming !== "true") {
    button.dataset.confirming = "true";
    button.textContent = "Click to Confirm";
    button.style.color = "#ef4444";
    button.style.fontWeight = "bold";

    if (confirmTimer) clearTimeout(confirmTimer);
    confirmTimer = setTimeout(() => {
      delete button.dataset.confirming;
      button.textContent = "Remove";
      button.style.color = "";
      button.style.fontWeight = "";
    }, 4000);
    return;
  }

  // Step 2: Confirmed execution
  if (confirmTimer) clearTimeout(confirmTimer);
  delete button.dataset.confirming;
  button.disabled = true;
  button.textContent = "Removing...";

  try {
    await performAction();
  } finally {
    button.disabled = false;
    button.textContent = "Remove";
  }
});
```

## 3. Non-Blocking Validation & Error Notifications
- **Form Validation**: Replace `alert("Please provide ...")` with inline visual helper messages adjacent to the invalid input fields (e.g. adding a `.field-error` CSS class or highlighting borders in red).
- **Transient Notices**: Use non-blocking DOM toast notifications that automatically fade out after 3 to 5 seconds.
- **Complex Dialogs**: For multi-step confirmations, render accessible DOM-based modal overlays (`<div class="asm-modal-backdrop">...</div>`) with discrete "Cancel" and "Confirm" DOM buttons.
```

---

### Specification 6: `.agents/rules/junction-lifecycle.md`

```markdown
---
trigger: always_on
description: "NTFS junction lifecycle, Windows Go os.ReadDir bug avoidance, real-directory materialization, and data preservation"
---

# Agent Space Manager: Junction & Link Lifecycle, Clean Unlinking, and Windows Go NTFS Invariants

When linking and unlinking skills, plugins, rules, and agents across filesystems, Agent Space Manager MUST strictly maintain link integrity, prevent source corruption, bypass Go runtime bugs on Windows, and safeguard user-owned files.

## 1. Windows Go `os.ReadDir` NTFS Junction Bug Avoidance
- **The Bug**: Google Antigravity and several Go-based language servers inspect plugin directories using Go's `os.ReadDir()`. On Windows, `os.ReadDir` evaluates NTFS directory junctions (`IO_REPARSE_TAG_MOUNT_POINT`) without calling `os.Stat()`. Consequently, Go's `entry.IsDir()` returns `false` (classifying junctions as `fs.ModeSymlink | fs.ModeIrregular`).
- **The Impact**: Antigravity filters discovery directories with `if !entry.IsDir() { continue }`. As a result, top-level junctioned plugin folders and skills in `~/.gemini/config/plugins` and `~/.gemini/config/skills` are silently skipped and ignored.
- **The Mandatory Solution: Real-Directory Materialization**:
  - For Antigravity (`bundle` mode), Agent Space Manager must NEVER create a top-level junction for plugins or flattened skills.
  - Instead, materialize a **real NTFS directory** (`fs.mkdirSync`) containing a real `.asm-owned.json` manifest.
  - Copy top-level metadata files (`plugin.json`, `SKILL.md`) directly into the materialized directory.
  - Subdirectories (sub-skills, workflows) may then be linked via child junctions.
  - Go's `os.ReadDir()` sees `entry.IsDir() === true` and Antigravity immediately discovers all plugins and slash commands.

## 2. Safe Unlinking Invariant (Never Delete Source)
- **Windows Reparse Point Severing**: When unlinking an NTFS directory junction, ALWAYS use `cmd.exe /c rmdir "${linkPath}"` with fallback to `fs.unlinkSync(linkPath)`.
- **Zero Recursive Deletes on Links**: NEVER run `fs.rmSync(linkPath, { recursive: true })` on an active junction or symbolic link. In Node.js on Windows, recursive directory removal on a junction can traverse the link and destroy the original source files in the hub repository!
- **Materialized Directories**: For ASM-materialized directories, verify that `isAsmOwnedDirectory(dirPath)` returns `true` (valid `.asm-owned.json` present) before calling `fs.rmSync(dirPath, { recursive: true, force: true })`.

## 3. Preserving User-Owned Files & Foreign Symlinks
- **Ownership State Tracking**: Every link, copied file, JSON key, and TOML block created by Agent Space Manager is recorded in `.asm-state/<ownerId>.json`.
- **Foreign Path Protection**:
  - Before modifying, replacing, or unlinking any directory or link, verify that:
    1. It is tracked in the current or previous ownership state; OR
    2. It contains `.asm-owned.json`; OR
    3. Its symlink target points inside `hubRoot` or `AI Agent Space` via `isTargetInsideHub()`.
  - If none of these conditions are met, the path is user-owned. **NEVER delete, unlink, or overwrite user-owned files or symlinks.**
  - If a collision occurs with a user-owned file/folder, abort with: `Conflict: user-owned directory or file already exists at ${linkPath}`.

## 4. Ghost Directory Cleanup
- When all components from a plugin or agent are removed, prune orphaned empty parent directories in `plugins/` and `skills/` using `sanitizeAgentConfigDirectory()` to prevent Language Server file-watcher exhaustion.
```

---

### Specification 7: `.agents/rules/watcher-throttling.md`

```markdown
---
trigger: always_on
description: "Configuration watcher throttling, polling rate limits (>= 2000ms), debounce windows, and file descriptor exhaustion avoidance"
---

# Agent Space Manager: Configuration Watcher Throttling & Resource Guard Invariants

When implementing configuration file watchers, background pollers, or daemon synchronization loops, developers and agents MUST adhere to these throttling invariants to protect IDE stability and prevent system resource exhaustion.

## 1. The Watcher Storm & File Descriptor Exhaustion Problem
- Modern AI IDEs (Cursor, VS Code, Windsurf, Antigravity) run dozens of background language server protocol (LSP) daemons, TypeScript/Rust watchers, and Git status monitors.
- If an agent space manager or plugin sync engine aggressively polls (e.g. 100ms interval) or responds immediately to every raw `fs.watch` event by running full re-scans (`scanPlugins`, `syncAllIdes`), it creates an I/O feedback loop:
  1. ASM writes a link or backup file.
  2. The IDE file watcher detects the change and triggers an LSP re-index.
  3. The LSP writes a cache/temp file.
  4. ASM detects the temp file and triggers another sync.
  5. Disk churn reaches 100%, CPU spikes, and file descriptor limits (`EMFILE: too many open files`) are exhausted, crashing the IDE or daemon.

## 2. Polling Rate Limit Invariant (>= 2000ms)
- **Minimum Polling Interval**: Background configuration watchers (such as Magpie daemon watching `plugins.json`) must NEVER poll faster than 1000ms. The project baseline is fixed at **>= 2000ms**:
  ```javascript
  magpieWatchInterval = setInterval(() => {
    syncFromMagpiePluginsJson(false);
  }, 2000);
  ```
- **Process Exit Guard (`.unref()`)**:
  - Every active background `setInterval` or `setTimeout` handle MUST be unreferenced via `.unref()`:
    ```javascript
    if (typeof magpieWatchInterval.unref === "function") {
      magpieWatchInterval.unref();
    }
    ```
  - This guarantees that background polling timers do not prevent Node.js process termination or cause integration test runners (`npm test`) to hang indefinitely.

## 3. Trailing-Edge Debounce (500ms - 1000ms)
- Watchers using event-driven APIs (`fs.watch` or `chokidar`) must NEVER trigger synchronous processing on the initial change event.
- All file change events must be buffered through a trailing-edge debounce timer of at least 500ms (standard: 500ms to 1000ms) to consolidate rapid bursts of writes (such as git branch switches, npm installs, or batch file materializations) into a single execution pass.

## 4. Zero-Work Modification Checks (Hash / mtime Guard)
- Polling routines must be guarded by lightweight change detection before executing expensive rescans or synchronization pipelines:
  - Check the target file's `mtimeMs` (modification timestamp) or compare a cryptographic hash (SHA-256).
  - If neither timestamp nor content hash has changed, exit immediately (0 disk writes, 0 rescans, 0 LSP notifications).

## 5. High-Churn Directory Exclusion
- File watchers must strictly ignore high-churn and transient directories:
  - `.git/`
  - `node_modules/`
  - `.agents/teamwork/`
  - `.asm-state/`
  - Temporary backup files (`*.asm-bak`, `*.tmp`)
```

---

## 7. Verification Method

These specifications can be verified against the codebase and test suite through the following steps:

1. **Verify MCP Adapter Compatibility**:
   - Run: `rtk node --test tests/sync-adapters.test.mjs`
   - Validates that Claude Code merges `mcpServers`, VS Code Copilot merges `servers`, OpenCode transforms into `{ type: "local", command: [...], environment: {...} }`, and Codex CLI writes `[mcp_servers.<name>]` in TOML.
2. **Verify Antigravity Real-Directory Materialization & Clean Unlinking**:
   - Run: `rtk node --test tests/sync-bundle.test.mjs`
   - Confirms that Antigravity bundles and skills are materialized as real directories (`alphaStat.isDirectory() === true`, `alphaStat.isSymbolicLink() === false`, `.asm-owned.json` present), bypassing the Windows Go `os.ReadDir` bug.
3. **Verify WebView2 Dialog Absence**:
   - Run: `rtk rg "window\.(confirm|alert|prompt)\(" page/`
   - Documents residual alerts at `page/app.js:2294,2331` for removal in Milestone 3.
4. **Verify Watcher Polling Rate**:
   - Inspect `server.mjs:175` to confirm `setInterval(..., 2000)` with `unref()`.
5. **Full Test Suite Execution**:
   - Run: `rtk npm test` to verify all 10 test suites pass with zero regressions.
