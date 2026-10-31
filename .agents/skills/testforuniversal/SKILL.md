---
name: testforuniversal
description: >
  Universal verification test suite and release auditor for Agent Space Manager.
  Runs all cross-platform checks across Windows, macOS, Linux, clean-slate installs, agent adapters, and safety invariants.
  Activate when the user types /testforuniversal, "test for universal", "verify universal", or "test universal".
---

# Universal Verification Test & Portability Auditor (`testforuniversal`)

Use this skill whenever verifying that **Agent Space Manager** works seamlessly across any operating system (Windows, macOS, Linux), any directory setup, clean-slate fresh installs, or prior to publishing/updating the plugin on GitHub.

---

## 1. Automated Execution

To run the full universal verification suite in sandbox isolation:

### PowerShell (Windows):
```powershell
$env:ASM_TEST="1"; $env:NODE_ENV="test"; rtk npm run test:universal
```

### Full Multi-Suite Verification:
```powershell
$env:ASM_TEST="1"; $env:NODE_ENV="test"; rtk npm test
```

### Bash / Zsh (macOS & Linux):
```bash
ASM_TEST=1 NODE_ENV=test rtk npm run test:universal
```

---

## 2. 15-Point Universal Verification Checklist

When evaluating readiness for release, verify all 15 conditions:

### A. Environment & Filesystem Portability
- **[C1] Clean-Slate First Boot:** If `hubRoot` or `~/AI-Agent-Space` does not exist on disk, `loadHubConfig()` initializes fallback config safely, and `scanPlugins` returns `[]` without unhandled crashes.
- **[C2] Linux XDG AppData:** `getAppDataDir()` resolves to `~/.config` (or `$XDG_CONFIG_HOME`) instead of Windows `%APPDATA%`.
- **[C3] macOS AppData:** `getAppDataDir()` resolves to `~/Library/Application Support`.
- **[C4] Windows NTFS Junctions:** Uses `mklink /J` for directory junctions (works without Administrator) and `cmd.exe /c rmdir` for unlinking without deleting source folders. Materializes real directories for Antigravity Go runtime compatibility (`IsDir() == true`).
- **[C7] Path Expansion with Spaces:** Paths containing spaces (e.g. `C:\Users\Jane Doe\...`), tildes (`~`), `%USERPROFILE%`, or `$HOME` expand deterministically via `expandHomePath`.

### B. Agent Profiles & Multi-IDE Adapters
- **[C5] Zero Agents Installed:** If no supported coding agents exist on the machine, `detectAgentConfigPath` and `syncAllIdes` complete with success status (0 errors).
- **[C6] 13 Standard Agent Adapters:** Normalizes schemas to match target agent expectations:
  - **VS Code Copilot:** Root key `"servers"` in `Code/User/mcp.json`.
  - **OpenCode:** Effect Schema `{ type: "local", command: [...], environment: { ... } }` in `opencode.json`.
  - **Codex CLI:** Quoted TOML tables `[mcp_servers.*]` in `config.toml`.
  - **Claude Code:** Managed rules import block in `CLAUDE.md`.
  - **Antigravity:** YAML frontmatter with `trigger: always_on` and clean single-line description.

### C. Reliability, Sanitization & Defense
- **[C8] Schema & Manifest Sanitization:** Proactively purges 0-byte JSON files and empty `{}` stubs missing mandatory `"id"` to protect Language Server Protocol (LSP) daemons and Electron from crashing.
- **[C9] Smart Middleware Tool Ceiling:** Caps LLM tools at `maxTools` (default 96) when tool schema volume exceeds model limits (>128 tools), preserving critical system tools (`read_file`, `write_file`, etc.).
- **[C10] Port & Daemon Isolation:** API server listens on `41789` (or `process.env.ASM_PORT`), reusing active background daemons without throwing `EADDRINUSE`.
- **[C11] Magpie Host IPC Surface:** Prefers native `globalThis.magpie.api` IPC inside Magpie desktop; falls back to HTTP REST API on `127.0.0.1:41789`.

### D. Safety Invariants & Release Hygiene
- **[C12] WebView2 Dialog Invariant:** Zero native `window.confirm`, `window.alert`, or `prompt` calls in UI. Destructive actions use 2-step inline confirmations with a 4-second reset timer.
- **[C13] Process Protection Invariant:** `killAgentProcesses` NEVER terminates protected GUI code editors (`antigravity.exe`, `cursor.exe`, `code.exe`, `windsurf.exe`, `opencode.exe`).
- **[C14] Atomic User Backups:** Never overwrites pre-existing user configurations without creating a `.asm-bak` backup. Tracks managed files in `.asm-state/<ownerId>.json`.
- **[C15] Zero-Hardcoded Machine Paths in Git:**
  - `package.json`: `optionsExample.toolsRoot` must be `""`.
  - `page/plugins-cache.json`: Ships with clean 0-count stub (no author drive paths).
  - Root `LICENSE` (MIT) present.
  - `.gitignore` ignores `*.asm-bak`, `.asm-state/`, and `LAST_ERROR.json`.

---

## 3. Failure Triage & Diagnostics

If a test fails during `/testforuniversal`:

1. **Path Assertion Failures on Windows vs POSIX:**
   Ensure test comparisons use `path.posix.join` or normalize backslashes before equality assertions.
2. **Cache Pollution:**
   Verify `process.env.ASM_TEST === "1"` is set so `updatePluginsCache` skips writing to `./page/plugins-cache.json`.
3. **Smart Middleware Tool Count Mismatch:**
   Verify that `onRequest(body, ctx)` returns `{ ...body, tools: finalTools }` rather than expecting in-place mutation.

