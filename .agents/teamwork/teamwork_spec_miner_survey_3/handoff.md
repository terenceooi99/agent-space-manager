# Handoff Report: Specification Mining for R4 (Test Suite Improvements) & R5 (Modular Safety Invariants)

**Agent ID**: `teamwork_spec_miner_survey_3`  
**Conversation ID**: `422c42c3-e401-4508-bc89-6336b3ae346e`  
**Parent Orchestrator ID**: `56e62fe3-5ba5-4e9d-8c31-b82ec2cab8ad`  
**Working Directory**: `d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_spec_miner_survey_3`  
**Deliverable Artifact**: `survey_tests_and_rules.md`  

---

## 1. Observation

1. **Test Suite Baseline & Execution**:
   - `package.json:8`: `"test": "node --test --test-reporter=spec \"tests/*.test.mjs\""`. The test suite uses native Node.js ESM testing (`node:test`, `node:assert/strict`) with zero external test runner dependencies.
   - Command execution output of `rtk npm test`:
     ```
     ▶ Feature 8: Hub Config Persistence, Effective Root & Migration (113.879ms)
     ▶ Feature 7: Multi-Agent Config Path Detection & Name Inference (162.6672ms)
     ▶ Magpie Host IPC Surface (index.mjs) (96.0145ms)
     ▶ Feature 5: Safe Junction Lifecycle (269.7411ms)
     ▶ Feature 10: Smart Middleware Tool Gateway (136.101ms)
     ▶ Feature 4: Granular Project & Workspace Overrides (145.5238ms)
     ▶ Feature 1: Hub Component Discovery & Categories Registry (159.6807ms)
     ▶ Feature 9 & 11: REST API Server, Agent Profiles Endpoint & CORS Security (361.9248ms)
     ▶ Feature 12: Components Storage Path Modification Tracking & Startup Auto-Reconnect (191.4762ms)
     ▶ Feature 2 & 3: Native-Format Multi-Agent Adapters (Skills, MCP, Rules, Agents) (447.6071ms)
     ▶ Feature 3 & 6: Antigravity Bundle Sync, Unlinking & Foreign Link Preservation (342.6167ms)
     ▶ Feature 13: Component Workability Status Dots & Quick Actions Detection (3.1265ms)
     ℹ tests 41
     ℹ suites 10
     ℹ pass 41
     ℹ fail 0
     ℹ duration_ms 690.9899
     ```
   - Current test files in `tests/`: 13 files (`config.test.mjs`, `detect.test.mjs`, `helpers.mjs`, `ipc.test.mjs`, `junction.test.mjs`, `middleware.test.mjs`, `projects.test.mjs`, `scan.test.mjs`, `server.test.mjs`, `startup-modifications.test.mjs`, `sync-adapters.test.mjs`, `sync-bundle.test.mjs`, `workability-status.test.mjs`).

2. **Test Sandboxing & Process Isolation**:
   - `tests/helpers.mjs:6-7`: `process.env.ASM_TEST = "1"; process.env.NODE_ENV = "test";`.
   - `tests/helpers.mjs:13-29`: `makeSandbox(prefix)` creates an isolated scratch tree in `os.tmpdir()` with mocked `home`, `appData`, `localAppData`, `hub`, `cacheDir`, and `sample-repo/.git/info/exclude`.
   - `manager.mjs:1503-1505`:
     ```javascript
     if (process.env.NODE_ENV === "test" || process.env.ASM_TEST === "1") {
       return { success: true, skipped: "test-environment" };
     }
     ```
     Guarantees no operating system processes are ever killed during unit tests.

3. **Current Component Default State in Code**:
   - `page/app.js:1536`: `const isEnabled = activeMap[plugin.id] !== false; // Default true`.
   - `manager.mjs:1151`: `const isEnabled = normalized.plugins ? normalized.plugins[plugin.id] !== false : true;`.
   - `adapters.mjs:165`: `const isEnabled = enabledMap ? enabledMap[plugin.id] !== false : true;`.
   - In all current modules, missing or empty `plugins: {}` evaluates to `true` (all components enabled by default).

4. **Connection Triggering in UI & Server**:
   - `page/index.html:169`: `<button type="button" class="btn-sm" id="rescanBtn">Rescan Hub</button>`. There is currently no Connect button beside Rescan Hub.
   - `page/app.js:1647-1663`: Toggling any component switch immediately invokes `triggerAutoSync()` (`page/app.js:2556`) which invokes `persistConfig()`, triggering automatic synchronization and bridge linking across all agents.
   - `server.mjs:309-322`: POST `/api/save` automatically triggers `syncAllIdes(config, plugins)`.

5. **Existing Safety Rules & Research**:
   - `.agents/rules/agent-safety-invariants.md`: 42 lines containing 6 invariants in a single monolithic markdown file:
     1. Process Termination Invariant (Never Kill Primary GUI IDEs)
     2. Configuration & Schema Sanitization Invariant
     3. Rule Normalization Invariant
     4. Desktop WebView2 UI Interaction Invariant
     5. Junction & Link Lifecycle Invariant
     6. Watcher & I/O Throttling Invariant
   - Agent-specific crash mechanisms discovered in codebase:
     - Antigravity: Go `os.ReadDir` bug on Windows requires real directory materialization (`manager.mjs:1161`); `CORTEX_MEMORY_TRIGGER_UNSPECIFIED` requires YAML frontmatter with `trigger: always_on` (`adapters.mjs:948`); empty `{}` in `outside-of-project.json` crashes project manager (`manager.mjs:1244`).
     - Claude Code: Expects flattened `~/.claude/skills/<skill>/SKILL.md` directly (`tests/sync-adapters.test.mjs:36`); atomic backup `.asm-bak` for `~/.claude.json` (`manager.mjs:712`); delimiter blocks in `CLAUDE.md`.
     - Cursor: Rules require `.mdc` format and frontmatter (`agents.mjs:228`).
     - OpenCode: Skills in `~/.config/opencode/skills`; MCP schema requires `{ type: "local", command: [...] }` transformation (`adapters.mjs:621`); subagents require `mode: subagent` (`adapters.mjs:931`).
     - VS Code Copilot: MCP file uses `servers` root key, NOT `mcpServers` (`agents.mjs:195`).

---

## 2. Logic Chain

1. **Derivation of Test Suite Gap for R1 (Manual Connect Flow)**:
   - Observation 4 shows that both UI (`triggerAutoSync()`) and backend (`/api/save`) currently couple saving configuration with active connection linking (`syncAllIdes`).
   - Requirement R1 explicitly specifies: *"Initiating a connection to an agent must only execute upon explicit manual click of this Connect button, rather than connecting automatically."*
   - Therefore, the test suite is missing tests to verify that configuration persistence does not create connection bridges unless a dedicated connect command is invoked, and that manual connection triggers the connection exclusively for the target agent.

2. **Derivation of Test Suite Gap for R2 (Default State & Persistence)**:
   - Observation 3 shows that all three engines (`page/app.js`, `manager.mjs`, `adapters.mjs`) currently default components to `true` whenever `plugins[id]` is undefined or `plugins` is `{}`.
   - Requirement R2 mandates: *"On initial application startup or when connecting to an agent for the first time, all components must default to unchecked / disabled. Persist and restore user component selections for each connected agent across restarts and subsequent sessions."*
   - Therefore, the test suite requires new tests that verify:
     a) Fresh/unconfigured agent entries have all components default to disabled (`false`).
     b) When a user explicitly enables a subset of components, saving and reloading config preserves that selection.
     c) Component preferences are isolated per agent and do not collide.

3. **Derivation of Test Suite Gap for R3 (Bridge Replacement)**:
   - Requirement R3 states: *"When a user manually connects to the same connected agent multiple times with different sets of components, replace the existing connection bridge rather than creating duplicate bridges, preventing connection bloat on the target agent."*
   - Existing tests (`tests/sync-bundle.test.mjs`) verify that `agent-space-bridge.json` is generated once, but no test tests repeated connection with modified components to the same agent.
   - Therefore, tests must verify that `activeAgents` length remains 1, old components are cleanly unlinked, MCP server keys are replaced without duplicates, and ownership records do not leak resources.

4. **Derivation of Modular Rules Architecture for R5**:
   - Observation 5 shows `.agents/rules/agent-safety-invariants.md` currently houses 6 invariants in a single file, while distinct agent platforms (Antigravity, Cursor, Windsurf, Claude Code, OpenCode, VS Code Copilot) experience distinct crash vectors.
   - Requirement R5 mandates expanding research on supported agents and splitting rules into modular topic-specific files under `.agents/rules/` while keeping `agent-safety-invariants.md` as the index and reference hub.
   - Categorizing into 7 focused topic files (`process-termination.md`, `config-sanitization.md`, `rule-normalization.md`, `mcp-schema-guards.md`, `webview2-dialogs.md`, `junction-lifecycle.md`, `watcher-throttling.md`) aligns with the exact avoidance mechanisms identified in the codebase and agent documentation.

---

## 3. Caveats

- **Scope Boundary**: As a specification miner, no code changes or test files were implemented in the main repository codebase. Implementation is reserved for Developer agents.
- **Environment Compatibility**: All tests must continue to support Windows (PowerShell/CMD), Linux, and macOS without platform-specific hardcoded path separators. `tests/helpers.mjs` handles this via `path.join()`.
- **Backward Compatibility**: Existing 41 tests pass cleanly; new test cases in `tests/connection-lifecycle.test.mjs` should supplement rather than break existing test suites.

---

## 4. Conclusion

1. **R4 (Test Suite)**:
   - Framework: Node.js native test runner (`node:test`) configured in `package.json`.
   - Recommended Action: Implement `tests/connection-lifecycle.test.mjs` using `makeSandbox()` from `tests/helpers.mjs`. Cover 4 test suites:
     - Manual connect action vs configuration auto-sync (R1).
     - Component default unchecked state on startup/first connect (R2).
     - Component preference persistence across restarts and per-agent isolation (R2).
     - Single connection bridge replacement, in-place update, and leak prevention (R3).

2. **R5 (Modular Rules)**:
   - Structure: Split `.agents/rules/` into 7 topic-specific avoidance mechanism files:
     1. `process-termination.md`
     2. `config-sanitization.md`
     3. `rule-normalization.md`
     4. `mcp-schema-guards.md`
     5. `webview2-dialogs.md`
     6. `junction-lifecycle.md`
     7. `watcher-throttling.md`
   - Master Index: Rewrite `agent-safety-invariants.md` with YAML frontmatter (`trigger: always_on`), summarizing and indexing each modular file.

---

## 5. Verification Method

To independently verify the findings in this report:

1. **Run Current Test Suite**:
   ```powershell
   rtk npm test
   ```
   *Expected Result*: 41 tests pass across 10 test suites in under 1 second with 0 failures.

2. **Inspect Existing Sandboxing & Process Protection**:
   - View `tests/helpers.mjs` lines 6–29 to confirm `ASM_TEST=1` and `makeSandbox()` environment isolation.
   - View `manager.mjs` lines 1501–1527 to confirm `killAgentProcesses()` skips process termination when `ASM_TEST=1`.

3. **Verify Component Default Behavior in Code**:
   - Inspect `page/app.js:1536`, `manager.mjs:1151`, and `adapters.mjs:165` to confirm current `!== false` default-true behavior.

4. **Verify Modular Safety Specification Artifact**:
   - Inspect `d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_spec_miner_survey_3\survey_tests_and_rules.md`.
