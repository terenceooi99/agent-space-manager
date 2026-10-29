## 2026-10-29T09:23:24Z
You are teamwork_worker_m2, implementing Milestone 2 (Backend Connection Engine & Single Bridge Replacement - Requirements R1, R2, R3) for Agent Space Manager.
Your working directory is: d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_worker_m2
Your parent orchestrator conversation ID is: 56e62fe3-5ba5-4e9d-8c31-b82ec2cab8ad

MANDATORY FIRST STEP:
Read ORIGINAL_REQUEST.md at:
d:\Software\Magpie\agent-space-manager\.agents\teamwork\ORIGINAL_REQUEST.md
Read PROJECT.md at:
d:\Software\Magpie\agent-space-manager\.agents\teamwork\orchestrator\PROJECT.md
Read the specification blueprint:
d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_spec_miner_m2_3\m2_blueprint.md
Read the explorer technical reports:
d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_explorer_m2_1\m2_explorer_1_report.md
d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_explorer_m2_2\m2_explorer_2_report.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

EXCLUSIVE FILE OWNERSHIP:
You own writing and modifying the following files:
- `manager.mjs`
- `adapters.mjs`
- `server.mjs`
- `index.mjs`
- `tests/workability-status.test.mjs`
- `tests/sync-adapters.test.mjs`
- `tests/sync-bundle.test.mjs`
Do NOT modify files outside this set (do not modify `page/index.html` or `page/app.js` which belong to Milestone 3).

IMPLEMENTATION INSTRUCTIONS:
Follow `m2_blueprint.md`, `m2_explorer_1_report.md`, and `m2_explorer_2_report.md`:
1. `manager.mjs`:
   - Implement and export `connectAgent(hubConfig, targetIde, options)`:
     * In-place deduplication of `hubConfig.ides` (match existing by id, baseId, agentType, or configPath; update properties in place instead of creating duplicate timestamped entries).
     * Aggregate legacy timestamped ownership manifests (`ide-<targetIde.id>*.json`) into `ide-<targetIde.id>.json` and clean legacy state files.
     * Execute differential sync via `syncIdePlugins(targetIde, allPlugins)`.
     * Regenerate `agent-space-bridge.json` and `shared/agent-connectors.json` via `writeHubCommunicationFiles` ensuring exactly one entry for this agent, and prune stale handoff inboxes.
     * Return `{ success: true, hubConfig, result }`.
   - Invert component default logic:
     * Line 1151: change to `const isEnabled = Boolean(normalized.plugins && normalized.plugins[plugin.id] === true);`
     * Line 2404: change to `const isEnabled = Boolean(ide.plugins && ide.plugins[plugin.id] === true);`
     * Ensure missing/empty `plugins: {}` evaluates strictly to `false` (default unchecked/disabled).
2. `adapters.mjs`:
   - Invert component default logic:
     * Line 165: change to `const isEnabled = Boolean(enabledMap && enabledMap[plugin.id] === true);`
3. `server.mjs`:
   - Add route `POST /api/connect`: accepts `{ id, agentType, plugins, configPath, exePath, componentPaths }`, calls `connectAgent(hubConfig, targetIde)`, saves config, returns response.
   - Update `POST /api/save`: decouple saving config from automatic `syncAllIdes()`. Only save configuration (`saveHubConfig(config)`), unless an explicit flag `sync: true` or `connect: true` is passed.
4. `index.mjs`:
   - Expose `connectAgent(hubConfig, targetIde, options)` in `AgentSpaceManagerPlugin.api`.
   - Update IPC `saveConfig` to decouple from automatic `syncAllIdes()`.
5. Test Suite updates:
   - In `tests/workability-status.test.mjs`, `tests/sync-adapters.test.mjs`, and `tests/sync-bundle.test.mjs`, update mock IDE objects that expect components to be linked with explicit `plugins: { [id]: true }` and add assertions verifying `plugins: {}` produces disabled status as specified in `m2_explorer_2_report.md`.
6. Run `rtk npm test` to verify 100% of tests pass cleanly with zero failures.

OUTPUT REQUIREMENTS:
- Write your handoff report to:
  d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_worker_m2\handoff.md
- Maintain liveness via progress.md in your directory.
- When finished, send a message to parent orchestrator (56e62fe3-5ba5-4e9d-8c31-b82ec2cab8ad).

## 2026-10-29T09:33:54Z
**Context**: Milestone 2 Implementation Status Check
**Content**: Checking in on your progress for Milestone 2 implementation (connectAgent, bridge deduplication, component default inversion, and API routes).
**Action**: Please update progress.md with current timestamp and let me know which steps are complete or currently underway.
