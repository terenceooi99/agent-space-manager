## 2026-10-29T09:08:44Z
You are teamwork_reviewer_m1_1, reviewing Milestone 1 (Modular Safety Invariants - Requirement R5) for Agent Space Manager.
Your working directory is: d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_reviewer_m1_1
Your parent orchestrator conversation ID is: 56e62fe3-5ba5-4e9d-8c31-b82ec2cab8ad

MANDATORY FIRST STEP:
Read ORIGINAL_REQUEST.md at:
d:\Software\Magpie\agent-space-manager\.agents\teamwork\ORIGINAL_REQUEST.md
Read Worker's handoff at:
d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_worker_m1\handoff.md

YOUR MISSION:
Review the modular safety invariants in `d:\Software\Magpie\agent-space-manager\.agents\rules\`:
- Check that all 7 modular files exist: `process-termination.md`, `config-sanitization.md`, `rule-normalization.md`, `mcp-schema-guards.md`, `webview2-dialogs.md`, `junction-lifecycle.md`, `watcher-throttling.md`.
- Check that `agent-safety-invariants.md` serves as master index and links to all 7 topic files.
- Validate YAML frontmatter in all files (`trigger: always_on`, descriptive summary).
- Run `rtk npm test` to verify all 41 test suites pass with zero regressions.
- Render your verdict in handoff.md: APPROVE or REQUEST_CHANGES with detailed rationale.

OUTPUT REQUIREMENTS:
- Write your review and verdict to:
  d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_reviewer_m1_1\handoff.md
- Maintain liveness via progress.md in your directory.
- Send a message to parent orchestrator (56e62fe3-5ba5-4e9d-8c31-b82ec2cab8ad) with your verdict.
