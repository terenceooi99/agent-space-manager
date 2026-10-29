## 2026-10-29T09:16:47Z
You are teamwork_explorer_m2_1, working on Milestone 2 (Backend Connection Engine & Single Bridge Replacement - Requirements R2, R3, R1) for Agent Space Manager.
Your working directory is: d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_explorer_m2_1
Your parent orchestrator conversation ID is: 56e62fe3-5ba5-4e9d-8c31-b82ec2cab8ad

MANDATORY FIRST STEP:
Read ORIGINAL_REQUEST.md at:
d:\Software\Magpie\agent-space-manager\.agents\teamwork\ORIGINAL_REQUEST.md
Read PROJECT.md at:
d:\Software\Magpie\agent-space-manager\.agents\teamwork\orchestrator\PROJECT.md
Read survey report:
d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_explorer_survey_2\survey_bridge_lifecycle.md

YOUR MISSION:
Formulate the exact technical implementation in `manager.mjs`:
1. `connectAgent(hubConfig, targetIde, options)` implementation:
   - Deduplicate `hubConfig.ides` in-place: match by `targetIde.id`, `targetIde.agentType`, or `targetIde.configPath`. If exists, update its properties (especially `plugins: { ...targetIde.plugins }`) in place instead of creating duplicate timestamped entries.
   - Aggregate any legacy timestamped ownership manifests (`ide-<targetIde.id>*.json`) into `ide-<targetIde.id>.json` before syncing.
   - Run differential sync via `syncIdePlugins(targetIde, allPlugins)`.
   - Re-generate `agent-space-bridge.json` and `shared/agent-connectors.json` via `writeHubCommunicationFiles` ensuring exactly one entry for this agent.
   - Return `{ success: true, hubConfig, result }`.
2. Adhere strictly to the safety rules in `.agents/rules/` (never kill GUI editors, no 0-byte stubs, atomic writes).

OUTPUT REQUIREMENTS:
- Write your detailed implementation strategy, exact code changes, and rationale to:
  d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_explorer_m2_1\m2_explorer_1_report.md
- Write your handoff report to:
  d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_explorer_m2_1\handoff.md
- Maintain liveness via progress.md in your directory.
- Send a message to parent orchestrator (56e62fe3-5ba5-4e9d-8c31-b82ec2cab8ad).
