## 2026-10-29T09:49:39Z
You are teamwork_worker_m4, implementing Milestone 4 (Test Suite Improvements & Full Verification - Requirement R4) for Agent Space Manager.
Your working directory is: d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_worker_m4
Your parent orchestrator conversation ID is: 56e62fe3-5ba5-4e9d-8c31-b82ec2cab8ad

MANDATORY FIRST STEP:
Read ORIGINAL_REQUEST.md at:
d:\Software\Magpie\agent-space-manager\.agents\teamwork\ORIGINAL_REQUEST.md
Read PROJECT.md at:
d:\Software\Magpie\agent-space-manager\.agents\teamwork\orchestrator\PROJECT.md
Read TEST_INFRA.md at:
d:\Software\Magpie\agent-space-manager\.agents\teamwork\orchestrator\TEST_INFRA.md
Read the survey report:
d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_spec_miner_survey_3\survey_tests_and_rules.md
Read Worker M2 and M3 handoffs:
d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_worker_m2\handoff.md
d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_worker_m3\handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

EXCLUSIVE FILE OWNERSHIP:
You own writing and creating:
- `tests/connection-lifecycle.test.mjs`
- and any supporting helpers or assertions in `tests/`
Do NOT modify production source code in `manager.mjs` or `page/` unless fixing a genuine test compatibility bug.

IMPLEMENTATION INSTRUCTIONS:
Follow `survey_tests_and_rules.md`:
Implement a comprehensive, turnkey test suite in `tests/connection-lifecycle.test.mjs` using `makeSandbox()` from `tests/helpers.mjs` and native `node:test` (`describe`, `it`, `assert` from `node:assert/strict`):
1. **Manual Connection Flow & Placement (R1)**:
   - Test that saving configuration via `saveHubConfig` / decoupled `/api/save` persists `hub-config.json` without automatically generating active bridge files or linking components.
   - Test that explicit `connectAgent(...)` or `POST /api/connect` initiates connection, writes `agent-space-bridge.json` with the active agent, and links enabled components.
   - Test that `page/index.html` contains the dedicated `#connectBtn` element directly adjacent to `#rescanBtn`.
2. **Component Default State & Preference Persistence (R2)**:
   - Test that on initial startup or when discovering an agent with empty `plugins: {}`, all components evaluate to disabled/unselected by default (`isEnabled === false`), linking 0 components.
   - Test that when user enables specific components (e.g. `plugins: { "alpha-plugin": true }`), saving and reloading configuration preserves that custom selection per agent across restarts.
   - Test that preferences for Agent A do not leak or overwrite preferences for Agent B.
3. **Single Connection Bridge Replacement (R3)**:
   - Test connecting Agent A with Plugin 1: verifies Plugin 1 is linked and 1 active agent exists in `agent-space-bridge.json`.
   - Test repeatedly connecting the same Agent A with Plugin 2 (modifying selection):
     * Verifies the existing bridge is replaced in-place.
     * `hubConfig.ides` contains exactly 1 entry for Agent A (no duplicate timestamped entries like `${baseId}-${Date.now()}`).
     * `agent-space-bridge.json:activeAgents` has length 1.
     * `shared/agent-connectors.json:connectors` contains exactly 1 key for Agent A.
     * Plugin 1 is cleanly unlinked/removed.
     * Plugin 2 is linked.
     * Zero resource leaks, zero dangling junctions, and zero 0-byte or empty `{}` stubs.
4. Run `rtk npm test` and ensure:
   - All 11 test suites pass with 100% success rate.
   - Zero test failures, zero regressions.

OUTPUT REQUIREMENTS:
- Write your handoff report to:
  d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_worker_m4\handoff.md
- Maintain liveness via progress.md in your directory.
- When finished, send a message to parent orchestrator (56e62fe3-5ba5-4e9d-8c31-b82ec2cab8ad).
