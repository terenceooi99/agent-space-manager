# Handoff Report: Milestone 2 `connectAgent` Backend Engine Architecture

**Agent:** `teamwork_explorer_m2_1`  
**Handoff Type:** Hard (Task complete)  
**Target:** Milestone 2 Implementation Team & Parent Orchestrator  
**Directory:** `d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_explorer_m2_1`  

---

## 1. Observation

1. **Current Agent Duplication Mechanism in UI (`page/app.js:2310-2314`)**:
   ```javascript
   const baseId = (agentType !== "custom" ? agentType : name).toLowerCase().replace(/[^a-z0-9]/g, "-");
   const id = hubConfig.ides.some((i) => i.id === baseId) ? `${baseId}-${Date.now()}` : baseId;
   hubConfig.ides.push({ id, name, agentType, exePath, configPath, componentPaths, enabled: true, plugins: {} });
   ```
   Every addition or save of an existing agent appends a duplicate entry with a timestamped ID (`${baseId}-${Date.now()}`) into `hubConfig.ides`.

2. **Ownership Manifest Isolation in Engine (`manager.mjs:1141-1142`)**:
   ```javascript
   const ownerKey = `ide-${normalized.id || agentType}`;
   const prevState = loadOwnershipState(ownerKey);
   ```
   Because each duplicate entry has a distinct ID, `loadOwnershipState` reads an empty `prevState` (`links: []`, `files: []`, `jsonKeys: {}`). Differential unlinking of components established by previous bridges never triggers, leaving orphaned links and files in target IDE directories.

3. **Multiplication in Communication Files (`adapters.mjs:1069-1083`, `1162-1175`)**:
   ```javascript
   const activeAgents = ides.filter((i) => i.enabled !== false).map(...)
   ...
   for (const a of activeAgents) {
     const aHandoff = path.join(handoffDir, a.id);
     ensureDir(aHandoff);
     connectors[a.id] = { ... };
   }
   ```
   All entries in `hubConfig.ides` are reflected in `agent-space-bridge.json:activeAgents`, `shared/agent-connectors.json:connectors`, and disk folders `shared/handoff/<agent.id>/`.

4. **Component Enabling Logic in Differential Sync (`manager.mjs:1151` and `adapters.mjs:165`)**:
   ```javascript
   const isEnabled = normalized.plugins ? normalized.plugins[plugin.id] !== false : true;
   ```
   Empty plugin maps (`plugins: {}`) currently default to `true` on initial creation in backend adapters, while Requirement R2 requires clean startup to default to unchecked / disabled.

5. **Test Suite Baseline**:
   Running `rtk npm test` executes 10 test suites in `tests/` with 41 passing tests (0 failures, 708ms duration).

---

## 2. Logic Chain

1. **From Observation 1 to Root Cause**: Appending timestamped IDs creates multiple records for the same physical agent. Deduplicating `hubConfig.ides` in place by matching `id`, `agentType`, and normalized `configPath` prevents duplicate entries from ever accumulating in configuration.
2. **From Observation 2 to State Aggregation**: Because legacy runs may have created timestamped state files (`ide-<canonicalId>-*.json`), simply switching to a canonical ID without state aggregation would leave previously created junctions unrecorded in `prevState`. Aggregating legacy states into `ide-<canonicalId>.json` before running `syncIdePlugins` ensures that `syncIdePlugins` is fully aware of all prior filesystem modifications and unlinks unselected components cleanly.
3. **From Observation 3 to Single Bridge Guarantee**: Because `writeHubCommunicationFiles` derives its output directly from `hubConfig.ides`, ensuring exactly one entry exists in `hubConfig.ides` mathematically guarantees that `agent-space-bridge.json:activeAgents` has exactly one entry, `shared/agent-connectors.json:connectors` has exactly one connector, and stale handoff directories can be cleanly pruned.
4. **From Observation 4 to Requirement R2 Alignment**: By persisting user selections in `hubConfig.ides[i].plugins` and updating `app.js` to render unchecked switches on initial startup (`activeMap[plugin.id] === true`), user selections are accurately tracked and restored without unwanted automatic enabling.
5. **From Observation 5 to Regression Safety**: Formulating `connectAgent` as an atomic operation calling existing verified primitives (`normalizeIdeEntry`, `syncIdePlugins`, `saveHubConfig`, `writeHubCommunicationFiles`) guarantees zero regression in existing test suites.

---

## 3. Caveats

1. **Custom Agent Profiles**: Custom agents without a recognized `agentType` rely on matching by `targetIde.id` or `configPath`. If a user creates two custom agents pointing to different directories, they are treated as distinct agents as expected.
2. **Existing GUI Editor Processes**: As mandated by Invariant 1 (`process-termination.md`), `connectAgent` never issues process kill commands to running GUI editors (`antigravity.exe`, `cursor.exe`, `code.exe`). All supported editors dynamically hot-reload configuration on disk.
3. **Frontend Wiring**: While this report specifies the exact backend engine implementation in `manager.mjs` and API routes, UI event listener binding for `#connectBtn` belongs to Milestone 3.

---

## 4. Conclusion

The technical implementation of `connectAgent(hubConfig, targetIde, options)` is completely formulated in `m2_explorer_1_report.md`. It provides:
1. **In-place deduplication** of `hubConfig.ides` matching by ID, Base ID, Agent Type, or Config Path.
2. **Pre-sync state aggregation** of any legacy timestamped manifests (`ide-<targetIde.id>*.json`) into `ide-<targetIde.id>.json` with automatic cleanup of legacy state files.
3. **Clean differential teardown and sync** via `syncIdePlugins(updatedIde, plugins)`.
4. **Single-entry communication file generation** via `writeHubCommunicationFiles` with stale handoff inbox removal.
5. **Full compliance** with all 7 safety invariants in `.agents/rules/`.

---

## 5. Verification Method

1. **Automated Unit & Integration Tests**:
   Execute:
   ```powershell
   rtk npm test
   ```
   Verify 100% of test suites pass with zero regressions.
2. **Dedicated Lifecycle Verification**:
   Inspect `tests/connection-lifecycle.test.mjs` (Milestone 4):
   - Connect an agent with Component A -> verify Component A linked.
   - Reconnect same agent with Component B -> verify Component A unlinked, Component B linked.
   - Verify `hubConfig.ides.length === 1`.
   - Verify `agent-space-bridge.json:activeAgents.length === 1`.
   - Verify `shared/agent-connectors.json:connectors` has exactly 1 key.
   - Verify `state/` has only `ide-<canonicalId>.json` and zero timestamped files.
3. **Safety Compliance Audit**:
   - Run `sanitizeAgentConfigDirectory` to verify zero 0-byte or empty `{}` stubs remain.
   - Verify no GUI editor processes are killed.
