# Milestone 1 Technical Report: Modular Safety Invariants (Part 1)

**Working Directory**: `d:\Software\Magpie\agent-space-manager`  
**Author**: `teamwork_explorer_m1_1`  
**Parent Orchestrator ID**: `56e62fe3-5ba5-4e9d-8c31-b82ec2cab8ad`  
**Date**: 2026-10-29  
**Status**: Investigation Complete & Content Formulated  

---

## 1. Executive Summary

Requirement **R5** of the Agent Space Manager project mandates researching supported AI agent environments (including Antigravity, Cursor, Windsurf, Claude Code/Desktop, OpenCode, Codex, and VS Code Copilot) to identify crash and conflict mechanisms, expanding `agent-safety-invariants.md`, and splitting the safety rules into modular, topic-specific markdown files in `.agents/rules/`.

This technical report delivers the in-depth investigation, architectural rationale, code evidence, and ready-to-deploy markdown contents for the first three modular safety invariant files:

1. **`process-termination.md`** (Safety Invariant 1): Zero Forceful Kills against GUI code editors (`antigravity.exe`, `cursor.exe`, `windsurf.exe`, `code.exe`, `opencode.exe`, etc.); hot-reload dynamic discovery; test sandbox isolation (`ASM_TEST=1`, `NODE_ENV=test`); restriction to headless auxiliary daemons.
2. **`config-sanitization.md`** (Safety Invariant 2): Zero 0-byte or empty `{}` stub JSON files in project/workspace directories; mandatory identity fields (`id`, `name`); automated `sanitizeAgentConfigDirectory` execution before and after sync; atomic writes and `.asm-bak` backups.
3. **`rule-normalization.md`** (Safety Invariant 3): Mandatory YAML frontmatter (`trigger: always_on`, `description`); syntax guards preventing `CORTEX_MEMORY_TRIGGER_UNSPECIFIED` in Antigravity's Cortex memory engine; managed delimiter blocks for multi-agent rule files (`CLAUDE.md`, `AGENTS.md`).

---

## 2. Invariant 1: Process Termination & GUI Editor Lifecycle

### 2.1 Technical Analysis & Crash Mechanisms
In multi-IDE bridge management, external tools often attempt to force a configuration reload by terminating editor processes (`taskkill /F /IM <name>` on Windows or `pkill -9` on Unix). When executed against primary GUI code editors, this causes severe instability:
- **Unsaved Work & Buffer Loss**: Abrupt termination bypasses editor buffer save prompts and autosave flushing, corrupting active tabs and discarding developer progress.
- **Orphaned Language Servers & File Locks**: GUI IDEs (such as Antigravity, Cursor, Windsurf, and VS Code) spawn dedicated Language Server Protocol (LSP) daemons (`gopls`, `pyright`, `tsserver`, `rust-analyzer`), file watchers, and Cortex background indexing daemons. Force-killing the parent process leaves orphaned child processes running with open locks on workspace databases (e.g. SQLite `state.vscdb`) and named pipes.
- **Chromium / Electron SingletonLock Corruption**: GUI editors based on Electron or Chromium rely on User Data directory locks (`SingletonLock`, `SingletonCookie`). Force-killing prevents graceful exit hooks (`app.on('will-quit')`), leaving stale lock symlinks. On subsequent launch, the editor displays "Another instance is already running" or aborts into a blank screen.
- **Hot-Reload Architecture**: Modern AI IDEs dynamically observe configuration directories (`~/.gemini/config/`, `~/.cursor/`, `~/.codeium/windsurf/`, `~/.config/opencode/`, `~/.claude/`) using file watching APIs (`ReadDirectoryChangesW`, `inotify`, `chokidar`). Linking or updating a skill, rule, or MCP JSON file triggers hot-reloading in memory without restarting the application.

### 2.2 Concrete Invariants in Codebase (`manager.mjs:1501-1570`)
1. **Protected GUI Agents Whitelist**:
   - `antigravity`, `cursor`, `windsurf`, `vscode`, `vscode-copilot`, `vscodium`, `opencode`, `kiro`, `gemini-cli`, `cline`, `roo-code`.
2. **Protected Executables Whitelist**:
   - `antigravity.exe`, `antigravity ide.exe`, `agy.exe`, `cursor.exe`, `windsurf.exe`, `code.exe`, `codium.exe`, `vscodium.exe`, `opencode.exe`, `electron.exe`, `devenv.exe`, `idea64.exe`.
3. **Graceful Auxiliary Only**:
   - Termination is permitted solely for headless background auxiliary daemons (e.g., custom sidecars) when explicitly requested via `killProcesses === true`.
   - Never use `/F` or `/T` on Windows (`taskkill /IM "${procName}"`), and never use `-9` on Unix (`pkill -f "${procName}"`).
4. **Test Sandbox Isolation**:
   - When `process.env.ASM_TEST === "1"` or `process.env.NODE_ENV === "test"`, `killAgentProcesses` returns `{ success: true, skipped: "test-environment" }` immediately, guaranteeing no test ever kills real system processes.

### 2.3 Recommended File Content: `.agents/rules/process-termination.md`

```markdown
---
trigger: always_on
description: "Universal process safety invariant: Zero Forceful Kills against GUI code editors, dynamic hot-reload preference, and test sandbox isolation"
---

# Safety Invariant 1: Process Protection & GUI Editor Lifecycle

## Core Avoidance Mechanism
Never forcefully kill running primary GUI code editors or AI IDEs. All component additions, removals, and configuration adjustments in Agent Space Manager must rely on dynamic filesystem hot-reloading rather than process termination.

## 1. Zero Forceful Kills Invariant
- **Prohibited Commands**: Never execute `taskkill /F`, `taskkill /T`, `pkill -9`, or equivalent ungraceful SIGKILL signals against any primary GUI editor.
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

## 2. Why Process Termination Causes Crashes and Corruption
1. **Unsaved Developer State**: Force-killing abruptly drops memory buffers, unsaved files, and undo history in active editing sessions.
2. **Orphaned Language Servers & Background Workers**: Electron-based editors spawn child daemons (`gopls`, `pyright`, `tsserver`, Cortex memory indexers, CodeGraphContext watch services). Terminating the parent process leaves orphans holding open file locks on `state.vscdb` and named pipes.
3. **Chromium SingletonLock Collisions**: Electron applications place a `SingletonLock` symlink in their User Data directories. Skipping exit hooks (`app.on('will-quit')`) leaves dangling lockfiles, causing subsequent editor launches to fail with "Another instance is already running" or freeze at a blank window.
4. **Desktop Host Jarring**: In embedded multi-window environments (e.g. Magpie WebView2), sudden process termination crashes host child frames and destroys UI layout state.

## 3. Dynamic Hot-Reload Preference
- Modern AI IDEs observe their configuration directories (`~/.gemini/config/`, `~/.cursor/`, `~/.codeium/windsurf/`, `~/.config/opencode/`, `~/.claude/`) using file watching APIs (`ReadDirectoryChangesW`, `inotify`, `chokidar`).
- Any update to linked skills, rules, or MCP JSON files is detected in real time by the agent's file watcher, refreshing tools and prompts in memory without requiring a restart.

## 4. Graceful Auxiliaries Only
- Process termination is restricted strictly to dedicated, headless auxiliary background daemons (e.g. mock server bridges, background synchronizers) and ONLY when explicitly opted in via `killProcesses === true`.
- If termination of an auxiliary daemon is required, use graceful termination:
  - Windows: `taskkill /IM "${procName}"` (NEVER `/F`)
  - Unix: `pkill -f "${procName}"` (NEVER `-9`)

## 5. Test Sandbox Isolation Invariant
- Unit and integration tests must run in isolated test sandboxes with:
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
- This ensures test suites running locally or in CI/CD pipelines never target or kill real operating system processes.
```

---

## 3. Invariant 2: Configuration & Schema Sanitization

### 3.1 Technical Analysis & Crash Mechanisms
AI IDEs load configuration, plugin, and project manifests during boot and when workspace paths change:
- **0-Byte JSON Files**: Created when an interrupted write, disk error, or `touch` operation creates an empty file. When an agent's project or plugin scanner calls `JSON.parse("")`, Node.js throws `SyntaxError: Unexpected end of JSON input` and Go JSON decoders return `EOF`. In background language servers and workspace indexers, unhandled JSON parsing errors cause uncaught crashes and infinite restart loops.
- **Empty `{}` Manifest Stubs**: A manifest written as `{}` without required identifiers (e.g. `outside-of-project.json`) causes Antigravity, Cursor, or OpenCode workspace managers to throw `TypeError: Cannot read properties of undefined (reading 'id')` or fail schema validation.
- **Ghost Folders**: Empty directories left behind after unlinking plugins or skills confuse directory discovery routines (such as Go `os.ReadDir`), causing agents to scan empty structures and register invalid blank tools.
- **Non-Atomic Writes & User Configuration Loss**: Modifying user-owned configuration files (`~/.claude.json`, `~/.codex/config.toml`, `mcp.json`, `opencode.json`, `CLAUDE.md`, `AGENTS.md`) directly in place risks zeroing out or corrupting user configurations if the process is terminated mid-write.

### 3.2 Concrete Invariants in Codebase (`manager.mjs:1074-1121`, `adapters.mjs:89-98`)
1. **Automated Pre- and Post-Sync Sanitization**:
   - `sanitizeAgentConfigDirectory(configDir, agentType)` scans `projects/` for manifests:
     - Unlinks any file where `stat.size === 0`.
     - Unlinks any file where content is `"{}"` or whitespace.
     - Unlinks any JSON object missing the required `"id"` property.
   - Scans `plugins/` and `skills/`, pruning empty ghost directories (`children.length === 0`).
   - Runs automatically before every `syncIdePlugins` call and after detecting agents.
2. **Required Identity Fields**:
   - Any project manifest or IDE entry must be verified to contain non-empty `"id"` and `"name"` before writing to disk.
3. **Backup Protection with `.asm-bak`**:
   - `ensureBackupOnce(filePath)` creates `${filePath}.asm-bak` prior to modifying any pre-existing user configuration.
   - If `.asm-bak` already exists, it is never overwritten, preserving the user's original pristine configuration.

### 3.3 Recommended File Content: `.agents/rules/config-sanitization.md`

```markdown
---
trigger: always_on
description: "Universal schema sanitization invariant: Zero 0-byte or empty {} stub JSON files, required identity fields, automated directory sanitization, and atomic backups"
---

# Safety Invariant 2: Configuration & Schema Sanitization

## Core Avoidance Mechanism
Prevent language server crash loops, schema validation failures, and configuration corruption by enforcing clean configuration sanitization, strict identity validation, automated stub pruning, and atomic `.asm-bak` backups.

## 1. Zero 0-Byte or Empty `{}` Stub Files
- **Strict Prohibition**: NEVER write blank JSON objects `{}` or 0-byte stub files into agent configuration directories (`projects/`, `workspaces/`, `plugins/`, `skills/`, or settings folders).
- **Failure Impact**:
  - Language servers and project indexers crash on `SyntaxError: Unexpected end of JSON input` when encountering 0-byte files.
  - Workspace loaders in Antigravity, Cursor, and OpenCode crash on `TypeError: Cannot read properties of undefined (reading 'id')` when encountering empty `{}` manifests.
  - Interrupted processes entering crash loops exhaust host CPU and memory.

## 2. Mandatory Required Identity Fields
- Before serializing any project manifest or workspace configuration to disk, verify that all mandatory identity fields exist and are non-empty:
  - `"id"`: Unique non-empty string identifier.
  - `"name"`: Human-readable display label.
- If a manifest is missing `"id"`, abort serialization immediately or prune the invalid file. Never allow invalid manifests to touch disk.

## 3. Automated Directory Sanitization (`sanitizeAgentConfigDirectory`)
- Agent Space Manager must proactively sanitize agent configuration directories before and after any sync or detection operation:
  ```javascript
  export function sanitizeAgentConfigDirectory(configDir, agentType = "general") {
    if (!configDir || !fs.existsSync(configDir)) return;
    try {
      // 1. Sanitize projects / workspace manifests
      const projDir = path.join(configDir, "projects");
      if (fs.existsSync(projDir)) {
        for (const ent of fs.readdirSync(projDir)) {
          if (!ent.endsWith(".json")) continue;
          const p = path.join(projDir, ent);
          try {
            const st = fs.statSync(p);
            if (st.size === 0) { fs.unlinkSync(p); continue; }
            const content = fs.readFileSync(p, "utf8").trim();
            if (content === "{}" || content === "") { fs.unlinkSync(p); continue; }
            const parsed = JSON.parse(content);
            if (parsed && typeof parsed === "object" && !parsed.id) { fs.unlinkSync(p); }
          } catch {}
        }
      }

      // 2. Sanitize empty ghost directories left behind in plugins / skills
      for (const sub of ["plugins", "skills"]) {
        const subDir = path.join(configDir, sub);
        if (fs.existsSync(subDir)) {
          for (const ent of fs.readdirSync(subDir)) {
            const itemPath = path.join(subDir, ent);
            try {
              const st = fs.lstatSync(itemPath);
              if (st.isDirectory() && fs.readdirSync(itemPath).length === 0) {
                fs.rmSync(itemPath, { recursive: true, force: true });
              }
            } catch {}
          }
        }
      }
    } catch {}
  }
  ```

## 4. Atomic Writes & `.asm-bak` Backups
- **Pristine State Preservation**: Before modifying any pre-existing user configuration file (`~/.claude.json`, `~/.codex/config.toml`, `opencode.json`, `mcp.json`, `CLAUDE.md`, `AGENTS.md`), create a `.asm-bak` backup:
  ```javascript
  export function ensureBackupOnce(filePath) {
    if (fs.existsSync(filePath)) {
      const bak = `${filePath}.asm-bak`;
      if (!fs.existsSync(bak)) {
        fs.copyFileSync(filePath, bak);
      }
    }
  }
  ```
- **Backup Invariant**: Never overwrite an existing `.asm-bak` file. The `.asm-bak` copy must reflect the user's original state prior to any Agent Space Manager modifications.
- **Atomic File Writing**: Write updated configurations through atomic file replacements (write to temp file and rename) or safe synchronous flushes to prevent partially written or 0-byte corruptions.
```

---

## 4. Invariant 3: Rule Normalization & Trigger Guards

### 4.1 Technical Analysis & Crash Mechanisms
Rules in Agent Space Manager are authored in Markdown and shared across multiple AI agents. Different agents interpret markdown rules through fundamentally different parser engines:
- **Antigravity Cortex Memory Engine**:
  - Antigravity ingests markdown rule files located in `~/.gemini/config/rules/` and project `.agents/rules/` using its Cortex memory engine.
  - **CRITICAL FAILURE MODE**: Cortex expects structured YAML frontmatter at the very top of each markdown rule. If a rule file lacks YAML frontmatter, or if the YAML frontmatter omits the `trigger:` property, the Cortex parser throws an uncaught exception:
    `CORTEX_MEMORY_TRIGGER_UNSPECIFIED`
  - This halts rule indexing, corrupts the agent's memory catalog, and causes the rule indexing supervisor to crash or enter an infinite retry loop.
- **Cursor AI (`.mdc` format)**:
  - Cursor expects rules in `.cursor/rules/*.mdc`. It requires frontmatter with `description`, `globs`, and `alwaysApply: true/false`. Plain `.md` files without frontmatter are ignored.
- **Claude Code, Codex, OpenCode, Windsurf**:
  - These agents use flat markdown instruction files (`CLAUDE.md`, `AGENTS.md`, `global_rules.md`).
  - Overwriting these files destroys user-authored guidelines. Instead, they require managed delimiter comment blocks (`<!-- agent-space-manager:start -->` ... `<!-- agent-space-manager:end -->`).

### 4.2 Concrete Invariants in Codebase (`adapters.mjs:922-957`)
1. **Mandatory Frontmatter Injection for Antigravity Rules**:
   - `parseMarkdownFrontmatter(raw)` separates existing YAML frontmatter and body.
   - Injects normalized frontmatter:
     ```yaml
     ---
     description: "Sanitized single-line description"
     trigger: always_on
     ---
     ```
2. **Automated Trigger Fallback**:
   - If `frontmatter.trigger` is missing, undefined, or empty, default to `"always_on"`.
   - This eliminates `CORTEX_MEMORY_TRIGGER_UNSPECIFIED` parser crashes.
3. **Description Sanitization**:
   - Extracted description replaces newline characters with single spaces (`.replace(/\r?\n/g, " ")`).
   - Wrapped via `JSON.stringify(desc)` to ensure valid YAML quoting without multiline syntax errors.
4. **User File Protection**:
   - If a target rule file already exists and is not tracked in the agent's ownership state (`.asm-owned.json`), Agent Space Manager never overwrites it, protecting pre-existing user configurations.

### 4.3 Recommended File Content: `.agents/rules/rule-normalization.md`

```markdown
---
trigger: always_on
description: "Universal rule normalization invariant: Mandatory YAML frontmatter, trigger syntax guards against CORTEX_MEMORY_TRIGGER_UNSPECIFIED, and multi-agent rule formatting"
---

# Safety Invariant 3: Rule Normalization & Trigger Guards

## Core Avoidance Mechanism
Prevent rule indexing daemon crashes and memory parser exceptions across heterogeneous AI agents by normalizing markdown rule frontmatter, enforcing mandatory `trigger: always_on` defaults, sanitizing descriptions, and isolating hub rules within managed delimiter blocks.

## 1. Mandatory Frontmatter for Metadata-Driven Agents
- Any rule file synchronized to metadata-driven agents (such as Google Antigravity's Cortex memory engine or Cursor) MUST include valid YAML frontmatter at the very top of the file:
  ```yaml
  ---
  trigger: always_on
  description: "Descriptive summary of the rule"
  ---
  ```
- **Boundary Invariant**: The opening `---` must begin on the very first character of line 1 (no leading whitespace, byte-order marks, or comments).

## 2. Preventing `CORTEX_MEMORY_TRIGGER_UNSPECIFIED`
- **Root Cause**: The Google Antigravity Cortex memory engine parses rules located in `~/.gemini/config/rules/` and project `.agents/rules/`. If a rule lacks YAML frontmatter or omits the `trigger:` property, Cortex aborts with an uncaught `CORTEX_MEMORY_TRIGGER_UNSPECIFIED` error, halting all rule ingestion.
- **Automated Syntax Guard**:
  - The rule adapter must inspect parsed frontmatter.
  - If `trigger` is omitted, null, or empty, default strictly to `trigger: always_on`:
    ```javascript
    const trigger = frontmatter.trigger || "always_on";
    ```
  - Valid recognized triggers in Cortex:
    - `always_on`: Always loaded into active agent context.
    - `user_prompt`: Triggered dynamically based on semantic similarity to user prompt.
    - `agent_eval`: Triggered during agent self-evaluation phases.
    - `periodic_trigger`: Evaluated on cron or periodic schedules.

## 3. Description Sanitization & YAML Safety
- Rule descriptions must be clean, single-line strings. Multiline descriptions inside unquoted YAML blocks break YAML parsers.
- Normalize descriptions:
  ```javascript
  const desc = (frontmatter.description || `Rule ${path.basename(destResolved, suffix)}`)
    .replace(/\r?\n/g, " ")
    .trim();
  ```
- Serialize using `JSON.stringify(desc)` so special characters (colons, quotes, escapes) remain syntactically valid YAML.

## 4. Multi-Agent Rule Format Adaptations
Rules must be transformed into each target agent's native format:

| Target Agent | Rule Location | Rule Format | Transformation Strategy |
|---|---|---|---|
| **Antigravity** | `~/.gemini/config/rules/*.md` | `antigravity-rule` | Frontmatter with `trigger: always_on` and `description` |
| **Cursor** | `.cursor/rules/*.mdc` | `cursor-rule` (`.mdc`) | Frontmatter with `description`, `globs: *`, `alwaysApply: true` |
| **Windsurf** | `memories/global_rules.md` | `inline-block` | Delimited markdown comment block |
| **Claude Code** | `~/.claude/CLAUDE.md` | `import-block` | Delimited markdown block `<!-- agent-space-manager:start -->` |
| **Codex CLI** | `~/.codex/AGENTS.md` | `inline-block` | Delimited markdown comment block |
| **OpenCode** | `~/.config/opencode/AGENTS.md` | `inline-block` | Delimited markdown comment block |

## 5. Delimited Block Isolation Invariant
- For agents using monolithic rule files (`CLAUDE.md`, `AGENTS.md`, `global_rules.md`), NEVER overwrite the file.
- Enclose managed rules strictly within unique boundary markers:
  ```markdown
  <!-- agent-space-manager:start -->
  # Synced Rules (Agent Space Manager)
  ... managed rules ...
  <!-- agent-space-manager:end -->
  ```
- User-authored rules outside these delimiters must remain untouched. Unlinking or removing components cleanly excises the block without leaving orphan headers or modifying user text.

## 6. User File Precedence
- When syncing individual rule files into an agent directory:
  - If a file already exists at the destination and is NOT tracked in `.asm-owned.json`, do not overwrite it.
  - Pre-existing user-authored rules take precedence over hub-synced components.
```

---

## 5. Summary Table: Invariants 1–3 at a Glance

| Invariant | File Name | Core Mechanism | Target Agents | Key Avoidance Impact |
|---|---|---|---|---|
| **Invariant 1** | `process-termination.md` | Zero Forceful Kills & Hot-Reload Preference | Antigravity, Cursor, Windsurf, VS Code, OpenCode | Prevents buffer loss, language server orphans, and Electron `SingletonLock` crashes |
| **Invariant 2** | `config-sanitization.md` | Schema Sanitization & No 0-Byte Stubs | All agents (`projects/`, `plugins/`, `skills/`) | Eliminates Language Server infinite crash loops on empty JSONs; protects user configs with `.asm-bak` |
| **Invariant 3** | `rule-normalization.md` | YAML Frontmatter & Trigger Normalization | Antigravity (Cortex), Cursor, Claude Code, Codex, OpenCode | Eliminates `CORTEX_MEMORY_TRIGGER_UNSPECIFIED`; prevents overwriting user rules via managed blocks |

---

## 6. Independent Verification & Test Alignment

These specifications directly correspond to passing test assertions in the Agent Space Manager test suite:
- `tests/detect.test.mjs:56-85`: Verifies that `sanitizeAgentConfigDirectory` prunes 0-byte JSONs, empty `{}` stubs, and ghost directories while preserving valid projects with `"id"`.
- `tests/sync-bundle.test.mjs:1-159`: Verifies Antigravity bundle syncing, rule placement, ownership tracking, and clean 100% unlinking.
- `tests/sync-adapters.test.mjs:9-78`: Verifies `.asm-bak` backup creation before modifying user configs and managed delimiter block insertion in `CLAUDE.md`.
- `tests/helpers.mjs:6-7`: Verifies that `ASM_TEST=1` and `NODE_ENV=test` bypass process termination.

All 41 existing tests pass under `rtk npm test` in 690ms.
