# Milestone 1: Modular Safety Invariants — Specification & Worker Blueprint

**Document Target**: `.agents/rules/` Modular Rule Decomposition  
**Author**: `teamwork_spec_miner_m1_3`  
**Parent Orchestrator**: `56e62fe3-5ba5-4e9d-8c31-b82ec2cab8ad`  
**Target Milestone**: Milestone 1 (Modular Safety Invariants)  
**Status**: Ready for Worker Implementation  

---

## 1. Executive Summary & Architecture Overview

Agent Space Manager bridges hub developer components (skills, rules, MCP servers, subagents, and hooks) across 13+ diverse AI agent environments (including Antigravity, Cursor, Windsurf, Claude Code/Desktop, OpenCode, VS Code Copilot, Codex CLI, Cline, Roo Code, and Kiro). 

In Milestone 1, we address Requirement **R5** from `ORIGINAL_REQUEST.md`:
> Research documentation for major supported agents in Agent Space Manager to identify plugin/rule conflict and crash avoidance mechanisms. Expand or amend `agent-safety-invariants.md` and split rules into modular topic-specific markdown files in `.agents/rules/` categorized by avoidance mechanism, keeping `agent-safety-invariants.md` as the master index and reference point.

### The Modular Rule Hierarchy
Previously, `.agents/rules/agent-safety-invariants.md` contained a high-level 6-item bulleted summary without agent-specific crash vectors or detailed code patterns. To prevent plugin and runtime crashes, the rules are structured into an indexed modular hierarchy of **8 files**:

```
.agents/rules/
├── agent-safety-invariants.md       <-- Master Index & Comprehensive Reference Hub
├── process-termination.md           <-- Avoidance Mechanism 1: GUI Editor Lifecycle & Process Safety
├── config-sanitization.md           <-- Avoidance Mechanism 2: Configuration & Schema Sanitization
├── rule-normalization.md            <-- Avoidance Mechanism 3: Rule Normalization & Metadata Triggers
├── mcp-schema-guards.md             <-- Avoidance Mechanism 4: Cross-Agent MCP Schema Compatibility
├── webview2-dialogs.md              <-- Avoidance Mechanism 5: Desktop WebView2 & Electron UI Safety
├── junction-lifecycle.md            <-- Avoidance Mechanism 6: Safe Junction, Symlink & Directory Lifecycle
└── watcher-throttling.md            <-- Avoidance Mechanism 7: Watcher Throttling & Descriptor Protection
```

Every single rule file must begin with valid YAML frontmatter (`trigger: always_on`, descriptive summary) to guarantee compatibility with Cortex and metadata-driven rule parsers.

---

## 2. Features Discovered & Verification Matrix

### Features Discovered
| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Rule Index | Master Safety Invariants Index | Authoritative entrypoint and executive reference hub for all safety rules | Rule requests / AI agent scans | Structured table of 7 avoidance mechanisms with hyperlinks | Graceful fallback to root invariants | `.agents/rules/agent-safety-invariants.md:1-42` |
| 2 | Process Safety | GUI Editor Process Protection | Prevents terminating active GUI coding editors (`antigravity.exe`, `cursor.exe`, `windsurf.exe`, `code.exe`, `opencode.exe`) | Agent profile / process name | Returns `{ success: true, skipped: "gui-editor-hot-reload-protected" }` | Logs skip reason, does not terminate | `manager.mjs:1501-1544`, `tests/detect.test.mjs:41` |
| 3 | Process Safety | Test Environment Isolation | Guards against terminating OS processes when executing unit/integration tests | `process.env.ASM_TEST`, `NODE_ENV` | Returns `{ success: true, skipped: "test-environment" }` | Process kill bypassed | `manager.mjs:1503-1505`, `tests/helpers.mjs:26` |
| 4 | Schema Safety | Config Directory Sanitization | Proactively deletes 0-byte JSON files, `{}` stubs without `id`, and empty ghost folders | Agent config path (`projects/`, `plugins/`, `skills/`) | File deletion of invalid stubs before Language Servers crash | Silently swallows file errors | `manager.mjs:1074-1120`, `tests/detect.test.mjs:56` |
| 5 | Schema Safety | Atomic Writes & Backup Guard | Creates `.asm-bak` backups prior to modifying user JSON/TOML configuration files | Target config file path | Backup file created, original modified safely | Backups skipped if file does not exist | `adapters.mjs:4-6`, `adapters.mjs:695` |
| 6 | Rule Engine | Cortex Frontmatter Normalization | Formats markdown rules with YAML frontmatter `trigger: always_on` and clean description | Raw markdown rule content | Normalized markdown preventing `CORTEX_MEMORY_TRIGGER_UNSPECIFIED` | Defaults `trigger: always_on` | `adapters.mjs:938-955` |
| 7 | Rule Engine | Delimited Block Isolation | Wraps managed rules in `CLAUDE.md`, `AGENTS.md`, and `global_rules.md` in delimiter tags | Synced rule blocks | Bounded sections; user-authored rules outside tags remain untouched | Blocks replaced in-place | `adapters.mjs:16-19`, `adapters.mjs:870-877` |
| 8 | MCP Compatibility | Root Key Normalization | Emits `"servers"` root key for VS Code Copilot and `"mcpServers"` for Claude/Cursor/Windsurf | MCP spec, target agent profile | Target config file with agent-appropriate root key | Fallback to `mcpServers` | `agents.mjs:195`, `adapters.mjs:686` |
| 9 | MCP Compatibility | OpenCode Schema Transformation | Converts standard MCP `{ command, args, env }` to OpenCode `{ type, command: [...], environment }` | Standard MCP definitions | `opencode.json` with compliant Effect Schema | Null returned for invalid defs | `adapters.mjs:655-677`, `tests/sync-adapters.test.mjs:118` |
| 10 | MCP Compatibility | Codex TOML Table Serialization | Formats MCP servers into TOML tables (`[mcp_servers.<name>]`) for Codex CLI | MCP server definitions | `~/.codex/config.toml` block | Syntax preserved | `adapters.mjs:134`, `tests/sync-adapters.test.mjs:82` |
| 11 | UI Interaction | Two-Step Inline Confirmation | Replaces native `window.confirm()` with self-resetting button toggle | Button click event | 4-second auto-reset inline confirmation state | Timers auto-clear on abort | `page/app.js:1349-1367`, `page/app.js:1220-1227` |
| 12 | Filesystem | Real Directory Materialization | Creates real directory folders on Windows to bypass Go runtime `os.ReadDir` junction bug | Target bundle path | Real directories with `.asm-owned.json` and leaf junctions | Falls back gracefully | `adapters.mjs:251-346`, `tests/sync-bundle.test.mjs:104` |
| 13 | Filesystem | Ownership Marker Tracking | Embeds `.asm-owned.json` and tracks state in `.asm-state/<id>.json` | Deployed component metadata | Clean removal of tool-owned files; zero deletion of foreign user files | Unowned files preserved | `adapters.mjs:239-245`, `adapters.mjs:254-259` |
| 14 | Watcher Safety | Storage Snapshot Fingerprinting | Calculates deterministic SHA-256 fingerprint of hub before triggering auto-sync | Hub root directory | Canonical hash, mtimes, sizes summary | `exists: false` if path invalid | `manager.mjs:1732-1960`, `tests/startup-modifications.test.mjs:23` |
| 15 | Watcher Safety | Watcher Polling Throttling | Enforces minimum 1000ms polling rate and 2000ms debounce to prevent `EMFILE` exhaustion | Watcher timer configs | Throttled background checks with debounce | Prevents LS CPU thrashing | `manager.mjs:2400-2450`, `.agents/rules/agent-safety-invariants.md:40` |

---

### Edge Cases & Boundary Conditions
| # | Feature | Input / Scenario | Observed Behavior | Handling / Invariant |
|---|---------|------------------|-------------------|----------------------|
| 1 | Process Termination | Custom agent executable named `code.exe` or `agy.exe` | Case-insensitive match against `PROTECTED_EXECUTABLES` | Execution skipped immediately; GUI editor remains open |
| 2 | Process Termination | `killAgentProcesses` called during `npm test` | Sandbox sets `ASM_TEST=1` and `NODE_ENV=test` | Returns `{ success: true, skipped: "test-environment" }`; zero OS commands run |
| 3 | Config Sanitization | 0-byte `outside-of-project.json` left in `projects/` | File causes `SyntaxError: Unexpected end of JSON input` | `sanitizeAgentConfigDirectory` detects `st.size === 0` and unlinks file |
| 4 | Config Sanitization | Empty `{}` project file created without `id` | Parser crashes when accessing `project.id.toLowerCase()` | `sanitizeAgentConfigDirectory` parses JSON, detects missing `id`, unlinks file |
| 5 | Rule Normalization | Markdown rule has no YAML frontmatter | Antigravity Cortex throws `CORTEX_MEMORY_TRIGGER_UNSPECIFIED` | `syncOwnedFiles` wraps body in frontmatter with `trigger: always_on` |
| 6 | Rule Normalization | Description in markdown rule contains newlines | Cortex YAML parser fails on multi-line unquoted strings | Description newlines replaced with single spaces and JSON-stringified |
| 7 | MCP Schema | VS Code Copilot receives `mcp.json` with `mcpServers` | VS Code Copilot ignores MCP configuration entirely | Adapter uses `key: "servers"` when target is `vscode-copilot` |
| 8 | MCP Schema | OpenCode receives `{ command: "node", args: ["server.js"] }` | OpenCode Effect Schema rejects object with validation error | `toOpenCodeMcpEntry` transforms to `{ type: "local", command: ["node", "server.js"] }` |
| 9 | WebView2 Dialogs | User clicks "Remove Agent" in desktop webview | Native `window.confirm()` suppressed by host; action silently drops | Button switches to "Click to Confirm" inline with 4s timeout |
| 10 | Windows Junctions | Antigravity scans `plugins/` linked as NTFS Directory Junction | Go `os.ReadDir` evaluates `IsDir() == false`, skips entire folder | Real directory materialized; junctions placed only on leaf files/subdirectories |
| 11 | Unlinking Safety | User manually created a symlink or file in target directory | Without ownership tracking, tool would delete user file | Check `isAsmOwnedDirectory()` and `.asm-state/<id>.json`; user files preserved |
| 12 | Watcher Throttling | Rapid file edits (e.g. git checkout of 500 files) | Multiple change events fired within milliseconds | Throttling ignores events until 2000ms debounce quiet period elapses |

---

## 3. Detailed File-by-File Specification for `.agents/rules/`

The Worker agent must create the 7 new topic-specific markdown files and update `agent-safety-invariants.md` in `d:\Software\Magpie\agent-space-manager\.agents\rules\`. Below is the complete specification, including YAML frontmatter, rationale, crash vectors, and exact code invariants for every file.

---

### File 0: Master Index (`agent-safety-invariants.md`)
**Path**: `d:\Software\Magpie\agent-space-manager\.agents\rules\agent-safety-invariants.md`  
**Purpose**: Authoritative master index, executive summary, and navigation hub for all safety invariants in Agent Space Manager.

#### Required YAML Frontmatter:
```yaml
---
trigger: always_on
description: "Master index and universal safety invariants for multi-IDE component orchestration, crash avoidance, and schema sanitization in Agent Space Manager"
---
```

#### Content Structure:
1. **Title**: `# Agent Space Manager: Universal Safety Invariants & Architecture Master Index`
2. **Executive Summary**:
   - Explanation of Agent Space Manager bridging developer assets across 13+ agent ecosystems.
   - Core philosophy: Non-destructive, hot-reload friendly, schema-compliant, and process-isolated.
   - Clarification that modern AI agents hot-reload disk configurations, making process termination unnecessary and harmful.
3. **Master Navigation Matrix**:
   | Invariant | Topic | Specification File | Scope / Target Agents | Key Avoidance Mechanism |
   |---|---|---|---|---|
   | Invariant 1 | Process Safety & Editor Protection | [`process-termination.md`](process-termination.md) | Antigravity, Cursor, Windsurf, VS Code, OpenCode, Kiro, Cline | Never terminate primary GUI editors; hot-reload dynamic updates |
   | Invariant 2 | Configuration & Schema Sanitization | [`config-sanitization.md`](config-sanitization.md) | All agents, Language Servers, Project Managers | Delete 0-byte & `{}` stubs; atomic writes with `.asm-bak` |
   | Invariant 3 | Rule Normalization & Metadata Triggers | [`rule-normalization.md`](rule-normalization.md) | Antigravity (Cortex), Cursor, Claude Code, Windsurf, OpenCode | Mandatory YAML frontmatter `trigger: always_on`; delimiter blocks |
   | Invariant 4 | Cross-Agent MCP Schema Compatibility | [`mcp-schema-guards.md`](mcp-schema-guards.md) | Claude, Cursor, Windsurf, VS Code Copilot, OpenCode, Codex | Copilot `servers` key, OpenCode schema transform, TOML tables |
   | Invariant 5 | Desktop WebView2 & Electron UI Safety | [`webview2-dialogs.md`](webview2-dialogs.md) | Magpie Desktop Host, WebView2, Electron | Zero native browser dialogs; 2-step inline confirmations |
   | Invariant 6 | Junction Lifecycle & Materialization | [`junction-lifecycle.md`](junction-lifecycle.md) | Antigravity (Go runtime), Windows NTFS, Unix symlinks | Materialize real directories on Windows; `.asm-owned.json` tracking |
   | Invariant 7 | Watcher Throttling & I/O Protection | [`watcher-throttling.md`](watcher-throttling.md) | Background watchers, Daemons, Magpie IPC | >= 1000ms polling, 2000ms debounce; canonical SHA-256 fingerprinting |
4. **Topic Summaries**: Brief 3-4 sentence summary of each of the 7 invariants referencing the corresponding file.
5. **Universal Rules for Contributors & Autonomous Agents**:
   - `ASM_TEST=1` sandbox isolation.
   - Strict preservation of user files (`.asm-owned.json` rule).
   - Atomic configuration modifications with `.asm-bak`.

---

### File 1: Process Safety & GUI Editor Protection (`process-termination.md`)
**Path**: `d:\Software\Magpie\agent-space-manager\.agents\rules\process-termination.md`  
**Purpose**: Strict protection of primary GUI IDE editors from forceful termination and graceful handling of background daemons.

#### Required YAML Frontmatter:
```yaml
---
trigger: always_on
description: "Process termination safety invariants: strict protection of primary GUI IDE editors from forceful termination and graceful handling of background daemons"
---
```

#### Content Structure:
1. **Title**: `# Safety Invariant 1: Process Safety & GUI Editor Lifecycle Protection`
2. **Architectural Rationale**:
   - AI code editors rely on native filesystem watchers to hot-reload skills, MCP configs, rules, and plugins dynamically.
   - Forcibly terminating an editor (`taskkill /F` or `pkill -9`) discards open editor buffers, destroys unsaved developer files, resets debugging state, and kills terminal sessions.
3. **Agent-Specific Crash & Failure Vectors**:
   - **Antigravity (`antigravity.exe`, `antigravity ide.exe`, `agy.exe`)**: Killing the GUI parent aborts active agent tasks, corrupts local session cache, and closes live agent conversation panes.
   - **Cursor (`cursor.exe`)**: Termination destroys composer history, closes active agent sessions, and resets uncommitted multi-file edits.
   - **Windsurf (`windsurf.exe`)**: Termination halts active Cascade workflows and risks state inconsistency in memory indices.
   - **VS Code / Copilot (`code.exe`, `codium.exe`)**: Force-killing closes all workspace windows and interrupts background extension host processes.
   - **OpenCode (`opencode.exe`, `electron.exe`)**: Killing OpenCode abruptly halts the Effect runtime supervisor.
   - **Test Suite Process Collisions**: If `killAgentProcesses` executes during automated testing without environment isolation, it can inadvertently kill the developer's live IDE running the test suite.
4. **Exact Code Invariants & Implementation Patterns**:
   - **Protected Agent Profiles** (`manager.mjs:1511-1523`):
     ```javascript
     const PROTECTED_GUI_AGENTS = new Set([
       "antigravity", "cursor", "windsurf", "vscode", "vscode-copilot",
       "vscodium", "opencode", "kiro", "gemini-cli", "cline", "roo-code",
     ]);
     ```
   - **Protected Executable Names** (`manager.mjs:1530-1543`):
     ```javascript
     const PROTECTED_EXECUTABLES = new Set([
       "antigravity.exe", "antigravity ide.exe", "agy.exe", "cursor.exe",
       "windsurf.exe", "code.exe", "codium.exe", "vscodium.exe",
       "opencode.exe", "electron.exe", "devenv.exe", "idea64.exe",
     ]);
     ```
   - **Mandatory Hot-Reload Bypass**:
     ```javascript
     if (PROTECTED_GUI_AGENTS.has(type) && !normalized.forceKill) {
       return { success: true, skipped: "gui-editor-hot-reload-protected" };
     }
     ```
   - **Test Sandbox Guard**:
     ```javascript
     if (process.env.NODE_ENV === "test" || process.env.ASM_TEST === "1") {
       return { success: true, skipped: "test-environment" };
     }
     ```
   - **Prohibition of Forceful Kill Flags**:
     - Never use `/F` or `/T` in `taskkill`.
     - Permitted auxiliary command: `taskkill /IM "${procName}"` (graceful termination).
   - **Default Opt-In Policy**:
     - `killProcesses` parameter in `unlinkAllForIde` defaults to `false`.

---

### File 2: Configuration & Schema Sanitization (`config-sanitization.md`)
**Path**: `d:\Software\Magpie\agent-space-manager\.agents\rules\config-sanitization.md`  
**Purpose**: Preventing Language Server crashes and watcher infinite loops by eliminating 0-byte JSON files, empty object stubs, and orphaned ghost directories.

#### Required YAML Frontmatter:
```yaml
---
trigger: always_on
description: "Configuration and schema sanitization invariants: preventing Language Server crashes by eliminating 0-byte JSON files, empty object stubs, and orphaned ghost directories"
---
```

#### Content Structure:
1. **Title**: `# Safety Invariant 2: Configuration & Schema Sanitization`
2. **Architectural Rationale**:
   - Modern IDEs maintain background Language Servers (LSPs) and project indexing daemons that continuously scan configuration directories.
   - Malformed JSON files (0-byte stubs or blank `{}` objects missing required fields) trigger unhandled exceptions, parser panics, and infinite restart loops.
3. **Agent-Specific Crash & Failure Vectors**:
   - **Antigravity Project Scanner (`~/.gemini/config/projects/`)**: A 0-byte `.json` file or empty `{}` causes `SyntaxError: Unexpected end of JSON input`, crashing the project manifest manager and preventing the IDE from indexing multi-project directories.
   - **Claude Code CLI (`~/.claude.json`)**: If `~/.claude.json` is corrupted or truncated, `claude` CLI fails to start with fatal JSON parse errors.
   - **OpenCode Configuration (`opencode.json`)**: OpenCode validates configuration using Effect Schema. An invalid or empty JSON stub causes the schema parser to crash on startup.
   - **Language Server Directory Thrashing**: Empty ghost directories left behind in `plugins/` or `skills/` cause recursive file watchers to log repeated missing-manifest warnings.
4. **Exact Code Invariants & Implementation Patterns**:
   - **Automated Directory Sanitization** (`manager.mjs:1074-1120`):
     - Executed before and after sync operations.
     - Prunes 0-byte files (`st.size === 0`).
     - Prunes empty `{}` files or whitespace-only files.
     - Verifies manifest identity: `if (parsed && typeof parsed === "object" && !parsed.id) fs.unlinkSync(p);`.
   - **Ghost Directory Cleanup**:
     ```javascript
     for (const sub of ["plugins", "skills"]) {
       const subDir = path.join(configDir, sub);
       if (fs.existsSync(subDir)) {
         for (const ent of fs.readdirSync(subDir)) {
           const itemPath = path.join(subDir, ent);
           if (fs.lstatSync(itemPath).isDirectory() && fs.readdirSync(itemPath).length === 0) {
             fs.rmSync(itemPath, { recursive: true, force: true });
           }
         }
       }
     }
     ```
   - **Atomic Writes & Backups** (`adapters.mjs:695`):
     - Before modifying any user config file, call `ensureBackupOnce(filePath)` to create `<file>.asm-bak`.
     - Write files completely; avoid leaving partial writes or 0-byte windows.

---

### File 3: Rule Normalization & Metadata Triggers (`rule-normalization.md`)
**Path**: `d:\Software\Magpie\agent-space-manager\.agents\rules\rule-normalization.md`  
**Purpose**: Rule normalization, metadata triggers, and syntax guards for multi-IDE memory engines.

#### Required YAML Frontmatter:
```yaml
---
trigger: always_on
description: "Rule normalization and metadata trigger invariants: mandatory YAML frontmatter, Cortex trigger specification, and delimiter-bounded inline rules"
---
```

#### Content Structure:
1. **Title**: `# Safety Invariant 3: Rule Normalization, Metadata Triggers & Syntax Guards`
2. **Architectural Rationale**:
   - AI agent engines employ different ingestion mechanisms for memory rules: Antigravity uses the Cortex memory engine; Cursor uses `.mdc` files; Claude, Codex, and Windsurf use markdown/TOML files with inline sections.
   - Incompatible rule syntax halts rule ingestion, causes parser crashes, or corrupts user-authored rules.
3. **Agent-Specific Crash & Failure Vectors**:
   - **Antigravity Cortex (`~/.gemini/config/rules/`)**: Cortex requires valid YAML frontmatter. If a markdown rule lacks frontmatter or omits `trigger:`, Cortex aborts with `CORTEX_MEMORY_TRIGGER_UNSPECIFIED`.
   - **Cursor AI (`.cursor/rules/*.mdc`)**: Rules without `.mdc` extensions or missing metadata (`description`, `globs`, `alwaysApply`) are silently ignored by Cursor's rule indexer.
   - **Claude Code (`CLAUDE.md`) & Windsurf (`global_rules.md`)**: Writing rules without delimiters risks overwriting user-authored guidelines, permanently erasing developer customization.
   - **Codex CLI (`AGENTS.md`)**: Rules not formatted as plain markdown in designated locations are dropped from the OpenAI system prompt.
4. **Exact Code Invariants & Implementation Patterns**:
   - **Mandatory YAML Frontmatter for Rules & Skills** (`adapters.mjs:938-955`):
     ```yaml
     ---
     description: "Descriptive summary"
     trigger: always_on
     ---
     ```
   - **Syntax Guard Rule**:
     - `trigger` defaults to `"always_on"` if undefined.
     - Descriptions must be sanitized: `desc.replace(/\r?\n/g, " ").trim()` and `JSON.stringify(desc)`.
   - **OpenCode Subagent Normalization** (`adapters.mjs:922-937`):
     - Injects `mode: subagent` into frontmatter for `.opencode/agents/*.md` to satisfy OpenCode's Effect Schema.
   - **Delimiter-Bounded Rule Blocks** (`adapters.mjs:16-19`, `870-877`):
     - Markdown:
       ```markdown
       <!-- agent-space-manager:start -->
       ... managed rules ...
       <!-- agent-space-manager:end -->
       ```
     - TOML:
       ```toml
       # >>> agent-space-manager
       ... managed config ...
       # <<< agent-space-manager
       ```
   - Non-owned user content outside delimiters is 100% preserved.

---

### File 4: Cross-Agent MCP Schema Compatibility (`mcp-schema-guards.md`)
**Path**: `d:\Software\Magpie\agent-space-manager\.agents\rules\mcp-schema-guards.md`  
**Purpose**: Cross-agent Model Context Protocol (MCP) schema transformations, root key normalization, and collision avoidance.

#### Required YAML Frontmatter:
```yaml
---
trigger: always_on
description: "Cross-agent MCP schema compatibility invariants: root key normalization, OpenCode schema transformation, TOML serialization, and user config preservation"
---
```

#### Content Structure:
1. **Title**: `# Safety Invariant 4: Cross-Agent MCP Schema Compatibility & Key Normalization`
2. **Architectural Rationale**:
   - The Model Context Protocol (MCP) specification is adopted across different IDEs with critical schema and root key divergences.
   - Providing an incompatible schema or root key causes tools to silently fail to register or triggers supervisor crashes.
3. **Agent-Specific Crash & Failure Vectors**:
   - **VS Code / GitHub Copilot (`Code/User/mcp.json` or `.vscode/mcp.json`)**: VS Code Copilot strictly requires the root key `"servers"`. Writing standard `"mcpServers"` causes Copilot to silently ignore all MCP servers.
   - **OpenCode (`opencode.json`)**: OpenCode's supervisor expects `{ "mcp": { "<server>": { "type": "local", "command": ["cmd", "arg1"], "environment": { ... } } } }`. Passing standard `{ "command": "npx", "args": [...] }` causes Effect Schema validation failure and crashes the supervisor.
   - **Codex CLI (`~/.codex/config.toml`)**: Codex uses TOML table configuration (`[mcp_servers.<name>]`). Writing JSON causes a fatal TOML syntax crash on Codex launch.
   - **Claude Code & Desktop (`~/.claude.json`)**: `~/.claude.json` contains OAuth tokens and user MCP servers. Overwriting the entire file destroys authentication.
4. **Exact Code Invariants & Implementation Patterns**:
   - **Root Key Normalization** (`agents.mjs:195`, `adapters.mjs:686`):
     - `vscode-copilot`: `key: "servers"`.
     - `claude-code`, `cursor`, `windsurf`, `gemini-cli`, `cline`, `roo-code`, `kiro`: `key: "mcpServers"`.
     - `opencode`: `key: "mcp"`, `format: "opencode-json"`.
   - **OpenCode Schema Transform Function** (`adapters.mjs:655-677`):
     ```javascript
     function toOpenCodeMcpEntry(def) {
       const remoteUrl = def.url || def.serverUrl || def.httpUrl;
       if (remoteUrl) return { type: "remote", url: remoteUrl, enabled: true };
       const cmd = def.command ? [def.command, ...(Array.isArray(def.args) ? def.args : [])] : [];
       if (cmd.length === 0) return null;
       const entry = { type: "local", command: cmd, enabled: true };
       if (def.env && Object.keys(def.env).length > 0) entry.environment = { ...def.env };
       return entry;
     }
     ```
   - **Codex TOML Serializer** (`adapters.mjs:134`):
     - Serializes MCP definitions into valid TOML table headers and quoted strings within `# >>> agent-space-manager` delimiters.
   - **Preservation of User-Defined Keys** (`adapters.mjs:712-720`):
     - Merge only managed keys. Only delete keys present in `prevOwnedKeys` that are no longer active. User-defined keys are never deleted.

---

### File 5: Desktop WebView2 & Electron UI Safety (`webview2-dialogs.md`)
**Path**: `d:\Software\Magpie\agent-space-manager\.agents\rules\webview2-dialogs.md`  
**Purpose**: Desktop WebView2 and Electron UI interaction standards, complete prohibition of native modal dialogs, and enforcement of two-step inline confirmations.

#### Required YAML Frontmatter:
```yaml
---
trigger: always_on
description: "Desktop WebView2 and Electron UI interaction invariants: complete prohibition of native modal dialogs and enforcement of two-step inline confirmations"
---
```

#### Content Structure:
1. **Title**: `# Safety Invariant 5: Desktop WebView2 & Electron UI Interaction Standards`
2. **Architectural Rationale**:
   - Agent Space Manager's frontend (`page/index.html`, `page/app.js`) is hosted inside Magpie Desktop via Microsoft Edge WebView2 or Electron webview.
   - WebView hosts by default suppress synchronous JavaScript modal dialogs (`window.confirm()`, `window.alert()`, `window.prompt()`), returning `false` immediately or locking the renderer thread.
3. **Agent-Specific Crash & Failure Vectors**:
   - **Silent Operation Abort**: If a button uses `if (confirm("Delete agent?"))`, the webview host returns `false` without displaying any popup, causing the deletion to silently fail and confusing users.
   - **Renderer Thread Freezes**: In certain WebView2 versions, unhandled native dialog invocations lock the JavaScript event loop, blocking IPC responses and triggering host watchdog terminations.
4. **Exact Code Invariants & Implementation Patterns**:
   - **Absolute Prohibition**:
     - Never use `window.confirm()`.
     - Never use `window.alert()`.
     - Never use `window.prompt()`.
   - **Two-Step Inline Confirmation Standard** (`page/app.js:1349-1367`):
     ```javascript
     // Step 1: Inline confirmation state
     if (button.dataset.confirming !== "true") {
       button.dataset.confirming = "true";
       button.textContent = "Click to Confirm";
       button.style.color = "#ef4444";
       button.style.fontWeight = "bold";

       if (confirmTimer) clearTimeout(confirmTimer);
       confirmTimer = setTimeout(() => {
         if (button) {
           delete button.dataset.confirming;
           button.textContent = originalText;
           button.style.color = "";
           button.style.fontWeight = "";
         }
       }, 4000);
       return;
     }

     // Step 2: Confirmed action execution
     if (confirmTimer) clearTimeout(confirmTimer);
     delete button.dataset.confirming;
     button.disabled = true;
     button.textContent = "Processing...";
     await executeAction();
     ```
   - **Custom HTML Modal Dialogs**:
     - All user inputs (such as "Add Custom Agent" or "Configure Component Paths") must use HTML overlay modals (`<div class="modal">`).

---

### File 6: Junction Lifecycle & Materialization (`junction-lifecycle.md`)
**Path**: `d:\Software\Magpie\agent-space-manager\.agents\rules\junction-lifecycle.md`  
**Purpose**: Junction, symlink, and ownership lifecycle invariants, real directory materialization on Windows, Go runtime compatibility, and clean unlinking.

#### Required YAML Frontmatter:
```yaml
---
trigger: always_on
description: "Junction, symlink, and ownership lifecycle invariants: real directory materialization on Windows, Go runtime compatibility, and clean unlinking"
---
```

#### Content Structure:
1. **Title**: `# Safety Invariant 6: Junction Lifecycle, Directory Materialization & Ownership Tracking`
2. **Architectural Rationale**:
   - Linking components across Windows, Linux, and macOS requires managing junctions and symlinks safely without deleting user sources or encountering OS-specific runtime bugs.
3. **Agent-Specific Crash & Failure Vectors**:
   - **Go `os.ReadDir` Bug on Windows (Antigravity)**:
     - Antigravity's core backend daemon is written in Go.
     - On Windows, Go's `os.ReadDir` and `os.Stat` on NTFS Directory Junctions evaluate `fileInfo.IsDir() == false` and flag `os.ModeIrregular`.
     - If `~/.gemini/config/plugins/<plugin>` is a raw NTFS junction, Antigravity skips it completely, rendering all plugins invisible.
   - **Accidental Source Deletion**:
     - Executing `fs.rmSync(path, { recursive: true, force: true })` on an unresolved junction or symlink on Windows can traverse the link and delete the entire source repository.
   - **Foreign User Link Clobbering**:
     - Users often maintain their own symlinks or local skills. Reckless pruning would delete user-authored tools.
4. **Exact Code Invariants & Implementation Patterns**:
   - **Real Directory Materialization on Windows** (`adapters.mjs:251-346`):
     - For Antigravity plugin bundles (`materializePluginBundle`) and skills (`materializeSkillDir`), create real directories on disk.
     - Write `.asm-owned.json` into the root of materialized directories.
     - Copy top-level metadata files (`plugin.json`, `SKILL.md`).
     - Create junctions only on leaf subdirectories or leaf files.
   - **Ownership Marker Tracking** (`adapters.mjs:239-245`):
     ```javascript
     export function isAsmOwnedDirectory(dirPath) {
       try {
         return fs.existsSync(path.join(dirPath, ".asm-owned.json"));
       } catch {
         return false;
       }
     }
     ```
   - **Safe Unlinking Standard**:
     - If path is a symlink/junction (`fs.lstatSync().isSymbolicLink()`), unlink the link alone (`fs.unlinkSync()`).
     - If path is a directory, verify `isAsmOwnedDirectory()` before recursive removal.
     - Foreign symlinks and user files without `.asm-owned.json` are strictly preserved.

---

### File 7: Watcher Throttling & Descriptor Protection (`watcher-throttling.md`)
**Path**: `d:\Software\Magpie\agent-space-manager\.agents\rules\watcher-throttling.md`  
**Purpose**: File watcher throttling, debounce guards, ignore patterns, and canonical snapshot hashing to protect OS file descriptors and prevent Language Server thrashing.

#### Required YAML Frontmatter:
```yaml
---
trigger: always_on
description: "File watcher throttling and descriptor protection invariants: minimum polling intervals, debounce guards, ignore patterns, and canonical snapshot hashing"
---
```

#### Content Structure:
1. **Title**: `# Safety Invariant 7: File Watcher Throttling, Debounce & Descriptor Protection`
2. **Architectural Rationale**:
   - Watching large codebases or hub component storage paths with high-frequency polling exhausts operating system file handles (`EMFILE`/`ENFILE`) and creates CPU spikes that throttle Language Servers.
3. **Agent-Specific Crash & Failure Vectors**:
   - **Operating System File Descriptor Exhaustion (`EMFILE`)**: Watching unpruned directory trees (including `node_modules` or `.git`) opens thousands of file handles, crashing Node.js and host processes.
   - **Infinite Auto-Sync Loops**: If modifying a file during sync triggers a watcher event which immediately triggers another sync, the system enters an infinite write loop, corrupting configuration files.
   - **Language Server CPU Starvation**: Continuous disk writes trigger IDE Language Servers (e.g. TypeScript LSP, Pyright, Rust Analyzer) to re-index workspaces continuously, exhausting CPU.
4. **Exact Code Invariants & Implementation Patterns**:
   - **Polling Rate Limits**:
     - Polling watchers must never poll faster than 1000ms.
     - Standard debounce quiet period is 2000ms.
   - **Deterministic Storage Fingerprinting** (`manager.mjs:1732-1960`):
     - `getComponentsStorageSnapshot(hubRoot)` computes a SHA-256 canonical hash of all component versions, sizes, and mtimes.
     - Auto-sync executes only if `diffComponentsStorageSnapshots` reports `hasChanges === true`.
   - **Mandatory Watcher Ignore Patterns**:
     - Always exclude `.git`, `node_modules`, `.asm-bak`, `.asm-state`, `temp`, `dist`.
   - **Git Index Exclusion** (`adapters.mjs:968-980`):
     - Synchronize relative paths of bridged components into `.git/info/exclude` via `ensureGitInfoExclude(repoPath, relPaths)` to prevent Git status churn.

---

## 4. Implementation Instructions for the Worker Agent

When the Worker agent executes Milestone 1:

1. **Working Directory & Target Files**:
   - Target directory: `d:\Software\Magpie\agent-space-manager\.agents\rules\`
   - Update file: `agent-safety-invariants.md`
   - Create 7 new files:
     - `process-termination.md`
     - `config-sanitization.md`
     - `rule-normalization.md`
     - `mcp-schema-guards.md`
     - `webview2-dialogs.md`
     - `junction-lifecycle.md`
     - `watcher-throttling.md`

2. **Format Invariant**:
   - Every file must have the specified YAML frontmatter starting at line 1 (`trigger: always_on` and `description`).
   - Every file must adhere to the detailed specifications provided in Section 3 of this document.

3. **Validation & Quality Gates**:
   - Run `rtk npm test` to verify zero regression across existing 41 tests.
   - Verify all 8 files exist in `.agents/rules/`.
   - Verify all 8 files have valid YAML frontmatter without syntax errors.
   - Verify `agent-safety-invariants.md` references and links to all 7 topic files cleanly.

---

## 5. Verification Method

To verify the completion of Milestone 1:
1. **File Existence Check**:
   ```powershell
   Get-ChildItem -Path "d:\Software\Magpie\agent-space-manager\.agents\rules"
   ```
   Assert 9 files total exist (the 8 new/updated files + existing `antigravity-rtk-rules.md`).
2. **YAML Frontmatter Verification**:
   Check that every file in `.agents/rules/` begins with:
   ```yaml
   ---
   trigger: always_on
   description: "..."
   ---
   ```
3. **Link Integrity Check**:
   Inspect `agent-safety-invariants.md` to ensure all relative links resolve cleanly to the 7 modular topic files.
4. **Test Suite Verification**:
   Execute `rtk npm test` to ensure 100% of test suites pass cleanly.
