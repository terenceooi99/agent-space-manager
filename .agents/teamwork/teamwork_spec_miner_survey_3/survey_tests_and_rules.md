# Technical Survey & Specification Mining: Test Suite Improvements (R4) & Modular Safety Invariants (R5)

**Workspace**: `d:\Software\Magpie\agent-space-manager`  
**Author**: `teamwork_spec_miner_survey_3`  
**Date**: 2026-10-29  
**Status**: Specification Complete  

---

## Executive Summary

This specification mining report covers Requirements **R4** (Test Suite Improvements) and **R5** (Safety Invariant Research and Modular Avoidance Rules) for Agent Space Manager. 

Agent Space Manager is a multi-agent orchestration bridge and dynamic MCP gateway for Magpie that coordinates configurations, skills, MCP servers, rules, and subagents across 13+ AI agent environments (including Antigravity, Cursor, Windsurf, Claude Code/Desktop, OpenCode, Codex, VS Code Copilot, Cline, Roo Code, and Kiro).

This report:
1. Conducts an exhaustive audit of the automated test suite (`tests/`, `package.json`, `tests/helpers.mjs`), mapping out the 41 passing tests across 10 suites and isolating test gaps for R1 (manual connect button), R2 (components default unchecked + persistence), and R3 (bridge replacement without duplication).
2. Provides a concrete, turnkey test specification and design for new tests verifying R1, R2, and R3.
3. Conducts deep safety invariant research across supported agents, documenting the root-cause failure modes (e.g. Go `os.ReadDir` Windows junction bug, Cortex `CORTEX_MEMORY_TRIGGER_UNSPECIFIED`, Language Server crashes on 0-byte JSON files, OpenCode MCP schema divergence, Copilot `servers` vs `mcpServers`, WebView2 synchronous dialog suppression).
4. Outlines a clean modular rule architecture under `.agents/rules/` that decomposes monolithic rules into 7 topic-specific avoidance mechanisms while retaining `agent-safety-invariants.md` as the master index.

---

## 1. Specification Sources Examined

| Source | File / Location | Key Information Extracted |
|---|---|---|
| User Request | `ORIGINAL_REQUEST.md` | Functional requirements R1–R5, acceptance criteria, constraints |
| Package Manifest | `package.json` | ESM configuration (`"type": "module"`), test script `node --test --test-reporter=spec "tests/*.test.mjs"`, zero third-party test dependencies |
| Test Sandbox Fixture | `tests/helpers.mjs` | `makeSandbox()`, environment variables (`ASM_TEST=1`, `NODE_ENV=test`, `ASM_NO_SERVER=1`), mock hub directory structure with 5 test fixtures |
| Existing Test Suites | `tests/*.test.mjs` (12 files) | Config, detect, ipc, junction, middleware, projects, scan, server, startup-modifications, sync-adapters, sync-bundle, workability-status |
| Core Manager Engine | `manager.mjs` (2,490 lines) | `syncIdePlugins`, `syncAllIdes`, `unlinkAllForIde`, `sanitizeAgentConfigDirectory`, `killAgentProcesses`, ownership state tracking |
| Adapter Engine | `adapters.mjs` (1,225 lines) | `writeHubCommunicationFiles`, `collectEnabledComponents`, schema transformation for MCP, rule frontmatter generation |
| Profiles Registry | `agents.mjs` (642 lines) | 13 agent profiles with paths, capabilities, rule formats, and project path overrides |
| Magpie IPC Surface | `index.mjs` | `AgentSpaceManagerPlugin.api` methods exposed to host webview |
| REST API Gateway | `server.mjs` (503 lines) | Port 41789 REST API endpoints (`/api/status`, `/api/save`, `/api/rescan`, `/api/startup-sync`, `/api/check-modifications`) |
| UI Frontend | `page/app.js` (2,622 lines), `page/index.html` | Connect/Rescan hub placement, component table rendering, `triggerAutoSync()` auto-save mechanism |
| Existing Safety Rules | `.agents/rules/agent-safety-invariants.md` | Monolithic 6-invariant safety rule document |

---

## 2. Requirement R4: Test Suite Improvements

### 2.1 Current Test Architecture & Execution
- **Runner**: Node.js built-in test runner (`node:test`) and assertion library (`node:assert/strict`).
- **Command**: `rtk npm test` executes `node --test --test-reporter=spec "tests/*.test.mjs"`.
- **Performance**: 41 tests across 10 test suites execute synchronously/asynchronously in ~690ms.
- **Sandboxing & Isolation**:
  - `tests/helpers.mjs` creates an isolated directory in `os.tmpdir()` (`asm-test-XXXXXX`).
  - Sets `process.env.ASM_TEST = "1"` and `process.env.NODE_ENV = "test"`.
  - Overrides `HOME`, `USERPROFILE`, `APPDATA`, `LOCALAPPDATA`, `AGENT_TOOLS_ROOT`, `ASM_NO_SERVER = "1"`, `ASM_CACHE_DIR`, `ASM_HOME_OVERRIDE`.
  - Provides a pre-populated fixture hub with `alpha-plugin` (skills, MCP, rules, agents, hooks), `beta-plugin` (skills, MCP, rules), `broken-plugin`, `empty-folder`, and standalone root skills/rules/agents.
  - Safe cleanup restores previous environment variables and deletes temporary folders recursively.

### 2.2 Test Suite Audit & Gap Analysis

```
┌─────────────────────────────────┬─────────────────┬────────────────────────────────────────────────────────┐
│ Requirement                     │ Current Test    │ Identified Gap / Missing Coverage                      │
├─────────────────────────────────┼─────────────────┼────────────────────────────────────────────────────────┤
│ R1: Manual Connection Trigger   │ 0% Direct       │ No test verifies that saving config does NOT connect   │
│     and UI Placement            │ Coverage        │ automatically when manual connection flow is active;   │
│                                 │                 │ No test for explicit manual connection execution API.  │
├─────────────────────────────────┼─────────────────┼────────────────────────────────────────────────────────┤
│ R2: Component Default State     │ Currently tests │ In existing tests, `ide.plugins = {}` defaulted ALL    │
│     and Preference Persistence  │ default TRUE    │ components to enabled (`!== false`). No test exists    │
│                                 │                 │ verifying initial startup defaults components to       │
│                                 │                 │ disabled/unchecked, or verifying per-agent             │
│                                 │                 │ preference persistence across restarts.                │
├─────────────────────────────────┼─────────────────┼────────────────────────────────────────────────────────┤
│ R3: Single Connection Bridge    │ Partial (test   │ No test exercises repeated connection to the SAME agent│
│     Replacement                 │ creates bridge  │ with different component sets; no test asserts that    │
│                                 │ once)           │ `activeAgents` length remains 1, old links are severed,│
│                                 │                 │ and no duplicate bridges or resource leaks occur.      │
└─────────────────────────────────┴─────────────────┴────────────────────────────────────────────────────────┘
```

#### Detailed Gap 1: Manual Connection Trigger (R1)
- Currently in `server.mjs` (`/api/save`) and `index.mjs` (`api.saveConfig`), saving configuration automatically invokes `syncAllIdes(config, plugins)`.
- In `page/app.js`, toggling a component checkbox immediately calls `triggerAutoSync()`, triggering auto-save and active connection.
- **Missing Test**:
  1. A unit/integration test verifying that updating component selections or calling configuration save does not initiate connection bridge linking without an explicit connect command.
  2. A test asserting that executing the manual connect API/IPC endpoint (`connectAgent` or `syncIde`) initiates connection exclusively for the target agent on demand.

#### Detailed Gap 2: Component Default State & Preference Persistence (R2)
- In `page/app.js`: `const isEnabled = activeMap[plugin.id] !== false; // Default true`.
- In `manager.mjs` and `adapters.mjs`: `const isEnabled = normalized.plugins ? normalized.plugins[plugin.id] !== false : true;`.
- When an agent is newly added or on clean startup, all components were defaulting to enabled (`true`).
- **Missing Test**:
  1. Test verifying that for a freshly connected agent (or empty `plugins` mapping), all discovered components default to unchecked / disabled (`false`).
  2. Test verifying that when a user explicitly enables a component (e.g. `alpha-plugin: true`), saves configuration, restarts the application / reloads config from disk, the selection is preserved (`alpha-plugin: true`, `beta-plugin: false`).
  3. Test verifying preference isolation between different agents (Agent A's preferences do not affect Agent B's preferences).

#### Detailed Gap 3: Single Connection Bridge Replacement (R3)
- In `syncAllIdes` and `writeHubCommunicationFiles`, `agent-space-bridge.json` records `activeAgents`, and `shared/agent-connectors.json` records `connectors`.
- If an agent is connected multiple times with modified components:
  - Bridge entry must be replaced in place: `activeAgents` must contain exactly 1 entry for the agent.
  - Connector must be updated in place: `connectors[agent.id]` has latest paths and component counts.
  - Target agent directory must prune previous components that were removed from the selection.
  - Configuration files (`mcp.json`, `CLAUDE.md`, etc.) must not accumulate duplicate MCP keys or duplicate rule blocks.
  - Ownership tracking (`.asm-owned.json`) must accurately reflect the new component set without leaking old references.
- **Missing Test**:
  1. Test connecting Agent X with Component Set 1 (`alpha-plugin`). Assert 2 skills linked, 1 MCP server injected, `agent-space-bridge.json` has 1 agent with component count = 2 skills.
  2. Test connecting Agent X AGAIN with Component Set 2 (`beta-plugin` only). Assert `alpha-plugin` skills are unlinked, `beta-plugin` skill is linked, `mcp.json` has only `beta-db` (no duplicate or lingering `alpha-mcp`), `activeAgents` length in `agent-space-bridge.json` is STILL 1, and no orphan files or dangling links remain.

### 2.3 Concrete Test Suite Improvement Plan
To ensure complete coverage and avoid bloated single test files, implement a new test file:
`tests/connection-lifecycle.test.mjs`
covering 4 major test suites:

1. **Suite 1: Manual Connection vs Auto-Sync Flow (R1)**
   - Test: `updating component selections or saving config does not trigger agent connection bridge without manual connect action`
   - Test: `manual connect action establishes connection bridge exclusively for the target agent`

2. **Suite 2: Component Default State (R2)**
   - Test: `on clean startup or first connection to an agent, all components default to unchecked/disabled`
   - Test: `collectEnabledComponents resolves zero components when an agent has unconfigured/empty plugin selections under default-disabled policy`

3. **Suite 3: Preference Persistence Across Sessions (R2)**
   - Test: `user component selections are persisted to hub config and faithfully restored on restart`
   - Test: `agent component preferences remain strictly isolated between distinct agents`

4. **Suite 4: Single Connection Bridge Replacement & Duplicate Avoidance (R3)**
   - Test: `reconnecting an agent with modified components replaces the bridge entry in agent-space-bridge.json without duplicates`
   - Test: `reconnecting an agent with different components replaces target agent files and removes deselected components cleanly`
   - Test: `reconnecting an agent with different components replaces MCP servers and rule blocks without duplicates or syntax corruption`
   - Test: `repeated reconnection is idempotent and creates zero resource leaks or orphaned ownership records`

---

## 3. Requirement R5: Safety Invariant Research & Modular Rules Architecture

### 3.1 Agent-Specific Crash & Conflict Research

#### 1. Antigravity (Google Gemini)
- **Go `os.ReadDir` Junction Bug on Windows**:
  - *Mechanism*: Antigravity's core backend daemon is compiled in Go. On Windows, Go's `os.ReadDir` and `os.Stat` on NTFS Directory Junctions evaluate `fileInfo.IsDir() == false` and `fileInfo.Mode() & os.ModeIrregular != 0`.
  - *Crash/Failure Mode*: If `~/.gemini/config/plugins/<plugin>` is a raw NTFS junction to a folder, Antigravity skips it completely, rendering all plugins invisible in the UI.
  - *Avoidance Rule*: Materialize real directories on Windows for plugin bundles and flattened skills, placing junctions only on leaf files/subdirectories, and marking real materialized directories with `.asm-owned.json` so unlinking deletes the folder cleanly.
- **Cortex Parser Trigger Crash (`CORTEX_MEMORY_TRIGGER_UNSPECIFIED`)**:
  - *Mechanism*: The Antigravity Cortex memory engine parses rules in `~/.gemini/config/rules/`.
  - *Crash/Failure Mode*: Any markdown file missing YAML frontmatter or with an empty `trigger:` property triggers `CORTEX_MEMORY_TRIGGER_UNSPECIFIED`, causing Cortex to abort rule ingestion or enter a parser crash loop.
  - *Avoidance Rule*: Normalize every rule written to Antigravity with YAML frontmatter containing `trigger: always_on` and non-empty `description`.
- **Corrupted Project Manifests (`outside-of-project.json`)**:
  - *Mechanism*: Antigravity project manager reads `~/.gemini/config/projects/*.json`.
  - *Crash/Failure Mode*: A 0-byte file or `{}` empty JSON causes JSON parsing crashes in the project manager.
  - *Avoidance Rule*: Validate `parsed.id` exists before writing project manifests; proactively delete 0-byte and `{}` files via `sanitizeAgentConfigDirectory()`.

#### 2. Claude Code & Claude Desktop (Anthropic)
- **Flattened Skills Requirement**:
  - *Mechanism*: Claude Code expects skills directly in `~/.claude/skills/<skill-name>/SKILL.md`.
  - *Crash/Failure Mode*: Linking a bundle directory (e.g. `~/.claude/skills/alpha-plugin/skills/...`) results in Claude Code failing to recognize commands.
  - *Avoidance Rule*: Flatten all skills into individual folders containing `SKILL.md`.
- **Atomic `~/.claude.json` Concurrent Access**:
  - *Mechanism*: `~/.claude.json` holds MCP servers and user auth tokens.
  - *Crash/Failure Mode*: Direct non-atomic writes during Claude CLI execution corrupt user authentication and custom MCP configurations.
  - *Avoidance Rule*: Always create `~/.claude.json.asm-bak` before modifications; merge MCP servers into `mcpServers` preserving existing user keys; write via atomic temporary file rename.
- **Rule Boundary Protection in `CLAUDE.md`**:
  - *Mechanism*: Global rules live in `~/.claude/CLAUDE.md`.
  - *Avoidance Rule*: Enclose managed rules inside `<!-- agent-space-manager:start -->` and `<!-- agent-space-manager:end -->` tags. Never overwrite user-authored rules outside these delimiters.

#### 3. Cursor AI
- **Rule Format Requirement (`.mdc`)**:
  - *Mechanism*: Cursor expects rules in `.cursor/rules/*.mdc` (or `~/.cursor/rules/*.mdc`).
  - *Failure Mode*: Rules formatted as plain `.md` without `.mdc` or frontmatter (`description`, `globs`, `alwaysApply`) are ignored.
  - *Avoidance Rule*: Format Cursor rules with `.mdc` suffix and valid frontmatter.
- **MCP Server Configuration**:
  - *Mechanism*: Configured in `~/.cursor/mcp.json` or `.cursor/mcp.json` under root key `mcpServers`.
  - *Avoidance Rule*: Merge into `mcpServers` object with backup `.asm-bak`.
- **Zero Process Killing**:
  - *Mechanism*: `cursor.exe` has an internal file watcher that dynamically hot-reloads `.cursor/rules` and `mcp.json`.
  - *Avoidance Rule*: Never terminate `cursor.exe`.

#### 4. Windsurf (Codeium)
- **Rule Format (`memories/global_rules.md`)**:
  - *Mechanism*: Windsurf reads rules from `~/.codeium/windsurf/memories/global_rules.md` or `.windsurf/rules/`.
  - *Avoidance Rule*: Inject rules via managed markdown delimiter blocks.
- **Unsupported Subagents**:
  - *Mechanism*: Windsurf does not support subagent definitions (`capabilities.agents = false`).
  - *Avoidance Rule*: Skip subagent file generation for Windsurf to prevent polluting workspace directories with unrecognized files.

#### 5. OpenCode
- **Config Path Target**:
  - *Mechanism*: OpenCode skills MUST target `~/.config/opencode/skills`, NEVER `plugins/`.
- **Divergent MCP Schema (`opencode.json`)**:
  - *Mechanism*: OpenCode uses an incompatible MCP schema:
    `{ "mcp": { "server-name": { "type": "local", "command": ["npx", "-y", "..."], "environment": { ... } } } }`.
  - *Crash/Failure Mode*: Providing standard `{ "command": "npx", "args": [...] }` causes OpenCode's MCP supervisor to throw a schema validation error and fail to start any tools.
  - *Avoidance Rule*: Dynamically transform standard MCP definitions into OpenCode's schema (`command` as string array, `environment` as dict, `type: "local"` or `"remote"`).
- **Subagent YAML Frontmatter**:
  - *Mechanism*: Subagents in `~/.config/opencode/agents/*.md` must contain `mode: subagent`.
  - *Avoidance Rule*: Inject `mode: subagent` in YAML frontmatter for all OpenCode agents.

#### 6. VS Code / GitHub Copilot
- **MCP Key Invariant (`servers` vs `mcpServers`)**:
  - *Mechanism*: VS Code Copilot reads `Code/User/mcp.json` or `.vscode/mcp.json` using the root key `"servers"`.
  - *Failure Mode*: Writing `"mcpServers"` causes Copilot to silently ignore all configured tools.
  - *Avoidance Rule*: Adapter must use `"servers"` for VS Code Copilot and `"mcpServers"` for other agents.
- **Specific Suffix Invariants**:
  - *Mechanism*: Prompts require `.prompt.md`, instructions require `.instructions.md`, agents require `.agent.md`.

#### 7. Desktop WebView2 UI Interaction Invariant
- **Synchronous Dialog Suppression**:
  - *Mechanism*: Magpie loads UI pages inside Microsoft Edge WebView2 / Electron. Synchronous dialog calls (`window.confirm()`, `window.alert()`, `window.prompt()`) are suppressed by the host environment by default.
  - *Crash/Failure Mode*: Calling `window.confirm()` returns false or hangs the renderer thread indefinitely.
  - *Avoidance Rule*: Strictly prohibit native dialogs. Use 2-step inline confirmations (button transforms to "Click to Confirm" with 4-second auto-reset timer) or custom HTML modals.

#### 8. Watcher Throttling & File Descriptor Exhaustion
- **I/O Throttling Invariant**:
  - *Mechanism*: Watching entire repositories or large hub folders with rapid disk polling exhausts operating system file handles (`EMFILE` / `ENFILE`) and causes Language Server thrashing.
  - *Avoidance Rule*: Configuration file watchers must never poll faster than 1000ms (standard: 2000ms) with debounce. Always exclude `.git`, `node_modules`, and `.asm-bak` files.

---

### 3.2 Modular Avoidance Rules Architecture (.agents/rules/)

To maintain clean separation of concerns and avoid monolithic rule files, split the safety rules into 7 modular, topic-specific markdown files in `.agents/rules/`, with `agent-safety-invariants.md` serving as the comprehensive index and reference hub.

```
.agents/rules/
├── agent-safety-invariants.md       <-- Master Index & Reference Hub (Always On)
├── process-termination.md           <-- Avoidance Mechanism 1: GUI Editor Lifecycle & Process Safety
├── config-sanitization.md           <-- Avoidance Mechanism 2: Configuration & Schema Sanitization
├── rule-normalization.md            <-- Avoidance Mechanism 3: Rule Normalization & Trigger Guards
├── mcp-schema-guards.md             <-- Avoidance Mechanism 4: Cross-Agent MCP Schema Compatibility
├── webview2-dialogs.md              <-- Avoidance Mechanism 5: Desktop WebView2 / Electron UI Safety
├── junction-lifecycle.md            <-- Avoidance Mechanism 6: Safe Junction, Symlink & Ownership Lifecycle
├── watcher-throttling.md            <-- Avoidance Mechanism 7: Watcher Throttling & Descriptor Protection
└── antigravity-rtk-rules.md         <-- Existing RTK & Token Saver Rule
```

#### Detailed Breakdown of Modular Rule Files

1. **`process-termination.md`**:
   - **Topic**: Process Safety & Editor Lifecycle Protection.
   - **Covered Agents**: Antigravity, Cursor, Windsurf, VS Code, OpenCode, Kiro, Cline, Roo Code.
   - **Key Invariants**:
     - Zero forceful kills: prohibition of `taskkill /F` or `pkill -9` against primary GUI coding editors.
     - Hot-reload preference: relying on inotify / file watching for zero-downtime updates.
     - Test environment isolation: mandatory `ASM_TEST=1` and `NODE_ENV=test` process-kill bypass.
     - Auxiliaries only: termination restricted to headless daemons with explicit opt-in.

2. **`config-sanitization.md`**:
   - **Topic**: Configuration Schema Sanitization & Language Server Crash Avoidance.
   - **Covered Agents**: Antigravity, Claude Code, Cursor, Windsurf, OpenCode.
   - **Key Invariants**:
     - No 0-byte or blank `{}` JSON files in `projects/`, `workspaces/`, or settings directories.
     - Required identity fields: `parsed.id` validation before writing manifests.
     - Automated directory sanitization: executing `sanitizeAgentConfigDirectory()` pre- and post-sync.
     - Atomic write pattern: temporary files with `.asm-bak` backups to prevent corrupted configs.

3. **`rule-normalization.md`**:
   - **Topic**: Rule Normalization, Metadata Triggers & Syntax Guards.
   - **Covered Agents**: Antigravity (Cortex), Cursor, Claude Code, Codex, OpenCode, Windsurf.
   - **Key Invariants**:
     - Mandatory YAML frontmatter: `trigger: always_on` and non-empty `description` for Cortex.
     - Prevention of `CORTEX_MEMORY_TRIGGER_UNSPECIFIED`.
     - Cursor `.mdc` format with `alwaysApply` and `globs`.
     - Delimited markdown blocks (`<!-- agent-space-manager:start -->`) in `CLAUDE.md`, `AGENTS.md`, and `global_rules.md`.

4. **`mcp-schema-guards.md`**:
   - **Topic**: Cross-Agent MCP Schema Compatibility & Collision Avoidance.
   - **Covered Agents**: Claude Code, Cursor, Windsurf, VS Code Copilot, OpenCode, Codex.
   - **Key Invariants**:
     - Standard `mcpServers` object vs VS Code Copilot `servers` key distinction.
     - OpenCode schema transformation: converting `{ command, args, env }` to `{ type: "local", command: [...], environment: {...} }`.
     - Codex CLI TOML table serialization (`[mcp_servers.<name>]`).
     - Preservation of user-defined MCP servers during hub synchronization.

5. **`webview2-dialogs.md`**:
   - **Topic**: Desktop WebView2 / Electron UI Interaction Standards.
   - **Covered Agents / UI**: Magpie Desktop Host, Embedded WebViews.
   - **Key Invariants**:
     - Strict prohibition of `window.confirm()`, `window.alert()`, and `window.prompt()`.
     - 2-step inline confirmations with 4-second auto-reset timers for destructive actions.
     - Non-blocking custom HTML modals for progress dialogs and complex inputs.

6. **`junction-lifecycle.md`**:
   - **Topic**: Junctions, Symlinks, Real Directory Materialization & Ownership.
   - **Covered Agents**: Antigravity (Go runtime), All agents on Windows/Linux/macOS.
   - **Key Invariants**:
     - Real directory materialization on Windows to bypass Go `os.ReadDir` `IsDir() == false` bug.
     - `.asm-owned.json` ownership markers for safe cleanup.
     - Protection of user foreign symlinks and external repositories.
     - Clean unlinking without leaving dangling junctions or ghost folders.

7. **`watcher-throttling.md`**:
   - **Topic**: File Watcher Throttling, Debounce & Descriptor Protection.
   - **Covered Agents**: Background daemons, Language Servers, Magpie middleware.
   - **Key Invariants**:
     - Minimum 1000ms polling rate, 2000ms standard debounce.
     - Exclusion of `.git`, `node_modules`, `.asm-bak`, and temporary build artifacts.
     - Deterministic fingerprinting (`getComponentsStorageSnapshot`) before triggering sync.
     - `.git/info/exclude` synchronization for project-level overrides.

8. **`agent-safety-invariants.md` (Master Index & Cross-Reference Hub)**:
   - Contains executive summaries of all 7 avoidance mechanisms.
   - Direct relative links to each modular rule file (`[Process Safety](process-termination.md)`, etc.).
   - Includes mandatory YAML frontmatter:
     ```yaml
     ---
     trigger: always_on
     description: "Master index and universal safety invariants for multi-IDE component orchestration, crash avoidance, and schema sanitization in Agent Space Manager"
     ---
     ```

---

## 4. Features Discovered Table

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | UI & Connection | Connect Button Placement | Dedicated manual trigger button placed directly right of Rescan Hub | Click event on `#connectBtn` | Triggers manual connection flow for selected agent | Visual error message in modal/banner if connect fails | `page/index.html:169`, `ORIGINAL_REQUEST.md:12` |
| 2 | Component State | Default Unchecked on First Connect | All components start unchecked/disabled on clean startup or new agent | Empty or missing `plugins` map in agent config | `isEnabled = false` for all components | N/A (safe fallback) | `page/app.js:1536`, `manager.mjs:1151`, `ORIGINAL_REQUEST.md:15` |
| 3 | Persistence | Per-Agent Preference Persistence | User checkbox selections are saved and restored per agent across restarts | User toggle changes, `hub-config.json` | Restored `plugins` map with exact user choices | Graceful fallback to default unchecked if corrupted | `page/app.js:1648`, `manager.mjs:28`, `ORIGINAL_REQUEST.md:16` |
| 4 | Bridge Lifecycle | Single Bridge Replacement | Reconnecting to same agent with different components replaces existing bridge in place | Agent ID, new component set | Single active bridge entry, clean unlinking of unselected items | Unlink errors logged, does not abort sync | `adapters.mjs:1069`, `manager.mjs:1141`, `ORIGINAL_REQUEST.md:18` |
| 5 | Cross-Agent Bridge | Hub Communication Files | Maintains `agent-space-bridge.json` and `shared/agent-connectors.json` | `hubRoot`, `hubConfig`, `allPlugins` | Bridge manifest and cross-agent connector registry | Handled via try/catch, returns false | `adapters.mjs:1058`, `tests/sync-bundle.test.mjs:136` |
| 6 | Safety / Process | GUI Editor Process Protection | Prevents terminating active GUI IDEs during component unlinking | Agent profile / executable name | Skips process kill with `skipped: "gui-editor-hot-reload-protected"` | N/A | `manager.mjs:1501`, `.agents/rules/agent-safety-invariants.md:10` |
| 7 | Safety / Schema | Config Directory Sanitization | Prunes 0-byte JSONs, empty `{}` manifests, and ghost folders | Agent config directory path | Deletes corrupt files before Language Server crashes | Swallows read/unlink errors | `manager.mjs:1074`, `tests/detect.test.mjs:56` |
| 8 | Safety / Rules | YAML Frontmatter Normalization | Formats markdown rules with `trigger: always_on` and descriptions | Raw markdown rule file | Valid YAML frontmatter preventing Cortex parser crash | Fallback trigger `always_on` | `adapters.mjs:938`, `.agents/rules/agent-safety-invariants.md:22` |
| 9 | Safety / Windows | Real Directory Materialization | Creates real directory bundles on Windows for Go `os.ReadDir` compatibility | Target bundle path, plugin components | Real directories containing `.asm-owned.json` and leaf junctions | Falls back to junction if permissions deny | `manager.mjs:1161`, `tests/sync-bundle.test.mjs:104` |
| 10 | Safety / MCP | OpenCode MCP Schema Transform | Translates standard MCP `{ command, args }` into OpenCode `{ type, command: [...] }` | Standard MCP server definitions | `opencode.json` with correct schema | Invalid defs skipped | `adapters.mjs:621`, `tests/sync-adapters.test.mjs:118` |
| 11 | Safety / MCP | VS Code Copilot Key Distinction | Uses `servers` key instead of `mcpServers` for Copilot `mcp.json` | MCP server definitions | `Code/User/mcp.json` with `servers: { ... }` | N/A | `agents.mjs:195`, `tests/sync-adapters.test.mjs:190` |
| 12 | Safety / UI | Two-Step Inline Confirmation | Replaces `window.confirm()` with self-resetting button toggle | Button click | 4-second auto-reset inline confirmation state | Timers auto-clear on abort | `page/app.js:2130`, `.agents/rules/agent-safety-invariants.md:32` |
| 13 | Safety / Watcher | Storage Snapshot Fingerprinting | Computes canonical SHA-256 hash of hub to avoid unnecessary auto-syncs | Hub path | Deterministic hash and component summary | Returns `exists: false` if path invalid | `manager.mjs:1890`, `tests/startup-modifications.test.mjs:23` |

---

## 5. Edge Cases & Boundary Conditions

| # | Feature | Input / Scenario | Observed Behavior | Handling / Invariant |
|---|---------|------------------|-------------------|----------------------|
| 1 | Component Defaults | Agent entry has `plugins: {}` or `plugins: undefined` | Previously evaluated `plugins[id] !== false` (TRUE) | Under R2: Must evaluate to FALSE when undefined / not explicitly enabled |
| 2 | Component Persistence | User enables Plugin A, closes app, reopens app | Loaded config preserves `plugins: { "plugin-a": true }` | Component table renders Plugin A checked, others unchecked |
| 3 | Bridge Replacement | Agent connected with Plugin A; reconnected with Plugin B only | Bridge must replace Plugin A with Plugin B | Links for Plugin A are severed, links for Plugin B created; `activeAgents` count remains 1 |
| 4 | Bridge Replacement | Agent reconnected 10 times consecutively with identical components | Idempotent execution; no duplicate bridges or keys | Files and links remain intact; timestamps updated in `agent-space-bridge.json` |
| 5 | Windows Go Runtime | Antigravity scans `plugins/` created as NTFS junction | Go `os.ReadDir` treats junction as non-directory (`IsDir() == false`) | Real directories materialized; junction created at leaf level |
| 6 | Cortex Rule Engine | Markdown rule without YAML frontmatter placed in `rules/` | Cortex crashes with `CORTEX_MEMORY_TRIGGER_UNSPECIFIED` | `syncOwnedFiles` injects YAML frontmatter with `trigger: always_on` |
| 7 | Language Server | Empty 0-byte `outside-of-project.json` written in `projects/` | Language Server enters infinite crash/restart loop | `sanitizeAgentConfigDirectory` proactively unlinks 0-byte and `{}` files |
| 8 | OpenCode MCP | Standard `{ command: "node", args: ["srv.js"] }` passed to OpenCode | OpenCode crashes or drops MCP server | Adapter converts to `{ type: "local", command: ["node", "srv.js"] }` |
| 9 | Copilot MCP | Adapter writes `{ mcpServers: { ... } }` into `Code/User/mcp.json` | VS Code Copilot silently ignores servers | Adapter uses `{ servers: { ... } }` specifically for Copilot |
| 10 | Desktop WebView2 | UI executes `if (window.confirm("Delete?")) ...` | Dialog suppressed; script returns `false` or hangs | Two-step button confirmation with 4-second timer avoids native dialogs |
| 11 | Concurrent Sync | Two agents trigger sync simultaneously | Potential race condition writing `agent-space-bridge.json` | Synchronous file write with JSON atomic dump; test sandbox isolation |
| 12 | Test Environment | `killAgentProcesses()` called during automated test suite | Real OS processes could be terminated if unmocked | `process.env.ASM_TEST === "1"` immediately aborts with `skipped: "test-environment"` |

---

## 6. Implementation Guidance for Developer Agents

When implementing R4 and R5, follow these specifications:

### For Developer implementing R4 (Test Suite Improvements):
1. **Create `tests/connection-lifecycle.test.mjs`**:
   - Use `makeSandbox()` from `tests/helpers.mjs` for 100% filesystem and process isolation.
   - Test Suite 1: Manual connection vs auto-sync (verifying that selection changes or config saves do not trigger connection bridges without explicit connect action).
   - Test Suite 2: Component default state (verifying that on clean start or first connect, all components default to unchecked/disabled).
   - Test Suite 3: Preference persistence (verifying that user component selections are saved to `hub-config.json` and restored on reload, and isolated across agents).
   - Test Suite 4: Single connection bridge replacement (verifying that reconnecting to an agent with different components replaces `activeAgents` in `agent-space-bridge.json` without duplicate entries, unlinks old components, updates MCP/rules, and avoids resource leaks).
2. **Execute and Validate**:
   - Run `rtk npm test` to ensure all 41 existing tests + new lifecycle tests pass cleanly (100% pass rate).

### For Developer implementing R5 (Safety Invariant Modularization):
1. **Create Topic Files in `.agents/rules/`**:
   - `process-termination.md`
   - `config-sanitization.md`
   - `rule-normalization.md`
   - `mcp-schema-guards.md`
   - `webview2-dialogs.md`
   - `junction-lifecycle.md`
   - `watcher-throttling.md`
2. **Include YAML Frontmatter on All Rule Files**:
   - Every file must begin with:
     ```yaml
     ---
     trigger: always_on
     description: "<Descriptive summary of avoidance mechanism>"
     ---
     ```
3. **Update `agent-safety-invariants.md` as Master Index**:
   - Retain `agent-safety-invariants.md` as the authoritative root document.
   - Add structured index sections with direct links to each modular rule file.
   - Summarize the core rule and referenced agent profiles for each topic.
