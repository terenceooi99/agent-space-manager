# Handoff Report: Single Connection Bridge Replacement Lifecycle (Requirement R3)

**Agent:** `teamwork_explorer_survey_2`  
**Date:** 2026-10-29  
**Type:** Hard Handoff (Investigation Survey Complete)  
**Deliverable File:** `d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_explorer_survey_2\survey_bridge_lifecycle.md`  

---

## 1. Observation

Direct code observations from the Agent Space Manager repository:

1. **Duplicate ID Generation in UI**:
   In `page/app.js` (lines 2310–2312):
   ```javascript
   const baseId = (agentType !== "custom" ? agentType : name).toLowerCase().replace(/[^a-z0-9]/g, "-");
   const id = hubConfig.ides.some((i) => i.id === baseId) ? `${baseId}-${Date.now()}` : baseId;
   hubConfig.ides.push({ id, name, agentType, exePath, configPath, componentPaths, enabled: true, plugins: {} });
   ```
   When a user adds or connects an agent with an existing `baseId`, a timestamped duplicate ID (`${baseId}-${Date.now()}`) is generated and pushed into `hubConfig.ides` as a distinct entry rather than replacing the existing bridge.

2. **Ownership State Splitting**:
   In `manager.mjs` (line 1141):
   ```javascript
   const ownerKey = `ide-${normalized.id || agentType}`;
   const prevState = loadOwnershipState(ownerKey);
   ```
   Because each duplicate IDE entry has a unique timestamped ID, each receives an isolated ownership manifest file in `~/.agent-space-manager/state/ide-<id>.json` (via `adapters.mjs:33–58`). A new duplicate entry loads an empty `prevState`, blinding it to the junctions, files, and MCP keys previously created by earlier bridges for the same agent.

3. **Bridge Registry and Connector Bloat**:
   In `adapters.mjs` (lines 1069–1083 & 1161–1176):
   ```javascript
   const activeAgents = ides.filter((i) => i.enabled !== false).map(...)
   ...
   for (const a of activeAgents) {
     const aHandoff = path.join(handoffDir, a.id);
     ensureDir(aHandoff);
     connectors[a.id] = { ... }
   }
   ```
   `writeHubCommunicationFiles` iterates over all `hubConfig.ides`. Every duplicate entry spawns an extra active agent in `agent-space-bridge.json`, an extra connector entry in `shared/agent-connectors.json`, and an extra physical handoff inbox directory on disk in `<hubRoot>/shared/handoff/<id>`.

4. **Absence of Dedicated Manual Connect Trigger**:
   In `page/index.html` (lines 167–171):
   ```html
   <div style="display:flex; gap:8px;">
     <button type="button" class="btn-sm" id="btnToggleAllFiles" title="...">📁 Expand All Files</button>
     <button type="button" class="btn-sm" id="rescanBtn">Rescan Hub</button>
   </div>
   ```
   There is no `Connect` button beside "Rescan Hub".
   In `page/app.js` (line 1662), changing any toggle executes `triggerAutoSync()` immediately, automatically running `persistConfig()` and `syncAllIdes()`.

5. **Existing Single-Agent Differential Engine**:
   In `manager.mjs` (lines 1144–1405):
   `syncIdePlugins(ide, allPlugins)` already contains comprehensive differential synchronization:
   - Compares desired components against `prevState.links`, `prevState.files`, `prevState.jsonKeys`, and `prevState.blocks`.
   - Prunes unselected plugin bundles (`syncPluginBundles`), unselected skills (`syncFlattenedSkills`), removed slash commands (`syncSkillSlashCommands`), removed MCP servers (`syncJsonMcpServers`), and removed rules (`syncMarkdownRulesBlock` / `syncOwnedFiles`).
   - Guarantees that if called on the **same** `ownerKey`, old components are cleanly unlinked and new components are linked.

6. **Safety Invariants Compliance**:
   - `manager.mjs:1511–1527`: `killAgentProcesses` explicitly protects GUI editors (`antigravity`, `cursor`, `windsurf`, `code`, `opencode`) from process termination.
   - `manager.mjs:1074–1121`: `sanitizeAgentConfigDirectory` purges 0-byte JSON files, empty `{}` files without an `"id"`, and empty ghost folders before and after sync.
   - `adapters.mjs:938–951`: Rule synchronization injects YAML frontmatter `trigger: always_on`.
   - `page/app.js:2294, 2331`: Native `alert()` calls are currently present, violating Invariant 4 (`agent-safety-invariants.md`).

---

## 2. Logic Chain

1. **From Observation 1 & 2 to Bloat Mechanism**:
   Because `page/app.js` generates `${baseId}-${Date.now()}` on repeated agent connections, multiple entries for the same agent populate `hubConfig.ides`. Each entry receives its own ownership state file (`ide-<id>.json`). When one entry connects with Component A and another connects with Component B, the second sync does not know about Component A in its `prevState` and cannot prune it. As a result, junctions and files from prior connections remain orphaned on disk.

2. **From Observation 3 to Bridge Bloat**:
   `writeHubCommunicationFiles` translates every enabled entry in `hubConfig.ides` directly into `agent-space-bridge.json` and `shared/agent-connectors.json`. Multiple entries for the same agent cause active agent counts and connector entries to multiply, creating multiple disk inboxes in `shared/handoff/`.

3. **From Observation 4 to Lack of Control**:
   Because connection triggers automatically on toggle switches without an explicit `Connect` button, users cannot stage component selections for an agent and deliberately replace the existing bridge in a single atomic transaction.

4. **From Observation 5 to Architectural Solution**:
   Since `syncIdePlugins` already performs clean differential unlinking and linking when given a persistent `ownerKey`, the core requirement for bridge replacement is:
   - Deduplicate `hubConfig.ides` to maintain exactly one canonical entry per physical agent.
   - Aggregate previous ownership states from any prior duplicate timestamped IDs into the canonical state before syncing.
   - Execute `syncIdePlugins` with the new component selection against the canonical state, letting its diffing engine sever unselected items and create new ones.
   - Prune obsolete duplicate ownership files and dangling handoff inboxes.
   - Atomically persist the updated configuration and rewrite `agent-space-bridge.json` and `agent-connectors.json`.

5. **From Observation 6 to Safety Invariant Preservation**:
   Adhering to `agent-safety-invariants.md` requires maintaining GUI hot-reload protection (no `taskkill`), running `sanitizeAgentConfigDirectory` on primary and parent directories, ensuring rule YAML frontmatter with `trigger: always_on`, and removing `window.alert()` calls from `page/app.js`.

---

## 3. Caveats

1. **Project Override Dependencies**:
   Projects in `hubConfig.projects` reference an `ideId`. If a user previously had duplicate IDE entries and assigned a project to a timestamped duplicate ID (e.g. `antigravity-1730188045123`), deduplication must repoint that project's `ideId` to the canonical ID (`antigravity`) so project overrides do not become orphaned.
2. **Concurrent Reconnections**:
   The local API server runs as a single Node process (`server.mjs`). Concurrency issues are minimal, but atomic filesystem operations (`fs.writeFileSync`, `.asm-bak` backups) must be maintained.
3. **No Caveats in Read-Only Scope**:
   All findings are based on direct verification of the working tree; zero source modifications were made during this investigation survey.

---

## 4. Conclusion

Requirement R3 can be cleanly achieved without architectural upheaval:
1. **New Backend Function (`manager.mjs`)**: Implement and export `connectAgent(hubConfig, targetIde, options)` to perform in-place agent deduplication, ownership state aggregation, differential sync via `syncIdePlugins`, and hub communication file updates.
2. **New Server Route (`server.mjs`)**: Add `POST /api/connect` delegating to `connectAgent(...)`.
3. **Magpie IPC Extension (`index.mjs`)**: Expose `connectAgent` in `AgentSpaceManagerPlugin.api`.
4. **UI Connect Trigger (`page/index.html` & `page/app.js`)**:
   - Render `#connectBtn` ("Connect") immediately to the right of `#rescanBtn`.
   - Wire `#connectBtn` to call `apiClient.connectAgent(selectedIde)`.
   - In `saveIdeBtn`, replace `${baseId}-${Date.now()}` with in-place replacement of existing entries matching `id`, `agentType`, or `configPath`.
   - Replace native `alert()` dialogs with inline banners to satisfy Safety Invariant 4.
5. **Component Default State (Requirement R2)**:
   - Change default component state in `page/app.js:1536` from `true` to `false` (`activeMap[plugin.id] === true`), persisting selections per agent.
6. **New Test Suite**: Add `tests/single-bridge-replacement.test.mjs` verifying clean replacement, unlinking of stale components, and zero bridge duplication.

Full code snippets, function specifications, and lifecycle flow diagrams are documented in `survey_bridge_lifecycle.md`.

---

## 5. Verification Method

To verify the survey findings and subsequent implementation:

1. **Baseline Automated Tests**:
   ```powershell
   rtk npm test
   ```
   Verify 41/41 passing tests in `tests/*.test.mjs`.

2. **Single Bridge Replacement Test**:
   Execute the newly introduced test suite:
   ```powershell
   rtk node --test tests/single-bridge-replacement.test.mjs
   ```
   Must verify:
   - Initial connection of Agent with Plugin A links Plugin A.
   - Subsequent connection of same Agent with Plugin B replaces bridge, unlinks Plugin A, links Plugin B.
   - `hubConfig.ides.length` remains 1.
   - `agent-space-bridge.json:activeAgents.length` remains 1.
   - `agent-connectors.json:connectors` contains exactly 1 key.
   - `shared/handoff/` contains exactly 1 directory.
   - No orphaned 0-byte or empty `{}` stubs exist.

3. **Invalidation Conditions**:
   - If connecting to an agent with modified components results in `agent-space-bridge.json` having >1 entry for that agent type, the test is invalidated.
   - If severed components remain in the target agent's config directory after reconnection, the test is invalidated.
   - If any GUI editor process is killed during reconnection, Safety Invariant 1 is violated.
