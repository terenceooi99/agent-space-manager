## 2026-10-29T09:39:21Z
You are teamwork_worker_m3, implementing Milestone 3 (Frontend Connect UI, Component Default Unchecked, and Preference Persistence - Requirements R1, R2, R3 UI) for Agent Space Manager.
Your working directory is: d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_worker_m3
Your parent orchestrator conversation ID is: 56e62fe3-5ba5-4e9d-8c31-b82ec2cab8ad

MANDATORY FIRST STEP:
Read ORIGINAL_REQUEST.md at:
d:\Software\Magpie\agent-space-manager\.agents\teamwork\ORIGINAL_REQUEST.md
Read PROJECT.md at:
d:\Software\Magpie\agent-space-manager\.agents\teamwork\orchestrator\PROJECT.md
Read the survey reports:
d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_explorer_survey_1\survey_ui_components.md
d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_explorer_survey_2\survey_bridge_lifecycle.md
d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_worker_m2\handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

EXCLUSIVE FILE OWNERSHIP:
You own writing and modifying:
- `page/index.html`
- `page/app.js`
Do NOT modify backend files or tests in this milestone.

IMPLEMENTATION INSTRUCTIONS:
Follow `survey_ui_components.md` and `survey_bridge_lifecycle.md`:
1. `page/index.html`:
   - Place a dedicated Connect button (`<button type="button" class="btn-sm btn-primary" id="connectBtn">⚡ Connect</button>`) directly to the right of `#rescanBtn` in the card-head `<div style="display:flex; gap:8px;">` container.
   - Maintain clean markup and responsive layout.
2. `page/app.js`:
   - Add click event handler for `#connectBtn`:
     * Identify current target (selected IDE or Project override).
     * Connect only upon explicit click of this Connect button.
     * Issue `POST /api/connect` via `apiClient.connectTarget(selected)` (or call Magpie Host IPC `connectAgent`).
     * Show connection progress / toast notification upon completion.
   - Component Default State (R2):
     * Line 1536: Change `const isEnabled = activeMap[plugin.id] !== false;` to `const isEnabled = activeMap[plugin.id] === true;`
     * Line 1408: Change `const isEnabled = ide.plugins ? ide.plugins[plugin.id] !== false : true;` to `const isEnabled = Boolean(ide.plugins && ide.plugins[plugin.id] === true);`
     * Line 1454: Invert project enablement check so missing plugins default to disabled (`false`).
     * On clean startup or first connection to an agent, all selectable components must be unchecked / disabled by default.
   - Preference Persistence (R2):
     * When user toggles a checkbox, save preference into `hubConfig.ides[i].plugins[pluginId]`.
     * Decouple toggle switches from `triggerAutoSync()`: toggling a switch must only save preferences (`persistConfig({ connect: false })`), NOT create filesystem links or bridges automatically. Connection must only happen when clicking `#connectBtn`.
     * Ensure preferences are restored per agent on startup and reload.
   - Bridge Replacement & In-place Deduplication in UI (R3):
     * In `saveIdeBtn` (lines 2310-2315), replace `${baseId}-${Date.now()}` with in-place agent update matching by `id`, `agentType`, or `configPath`.
   - Desktop WebView2 Dialog Safety (Invariant 4):
     * Replace native `alert()` calls (lines 2294, 2331) with inline visual banners or toasts per `agent-safety-invariants.md`.
3. Verification:
   - Run `rtk npm test` to ensure 100% of tests pass cleanly with zero regressions.

OUTPUT REQUIREMENTS:
- Write your handoff report to:
  d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_worker_m3\handoff.md
- Maintain liveness via progress.md in your directory.
- When finished, send a message to parent orchestrator (56e62fe3-5ba5-4e9d-8c31-b82ec2cab8ad).
