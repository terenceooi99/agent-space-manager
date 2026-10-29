## 2026-10-29T08:05:33Z
You are teamwork_worker_m1, implementing Milestone 1 (Modular Safety Invariants - Requirement R5) for Agent Space Manager.
Your working directory is: d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_worker_m1
Your parent orchestrator conversation ID is: 56e62fe3-5ba5-4e9d-8c31-b82ec2cab8ad

MANDATORY FIRST STEP:
Read ORIGINAL_REQUEST.md at:
d:\Software\Magpie\agent-space-manager\.agents\teamwork\ORIGINAL_REQUEST.md
Read PROJECT.md at:
d:\Software\Magpie\agent-space-manager\.agents\teamwork\orchestrator\PROJECT.md
Read the specification blueprint:
d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_spec_miner_m1_3\m1_rules_blueprint.md
Read the explorer technical reports:
d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_explorer_m1_1\m1_explorer_1_report.md
d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_explorer_m1_2\m1_explorer_2_report.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

EXCLUSIVE FILE OWNERSHIP:
You own writing and creating files in `d:\Software\Magpie\agent-space-manager\.agents\rules\`:
- `.agents/rules/agent-safety-invariants.md` (Update as master index and reference hub)
- `.agents/rules/process-termination.md` (Avoidance Mechanism 1: GUI Editor Lifecycle & Process Safety)
- `.agents/rules/config-sanitization.md` (Avoidance Mechanism 2: Configuration & Schema Sanitization)
- `.agents/rules/rule-normalization.md` (Avoidance Mechanism 3: Rule Normalization & Metadata Triggers)
- `.agents/rules/mcp-schema-guards.md` (Avoidance Mechanism 4: Cross-Agent MCP Schema Compatibility)
- `.agents/rules/webview2-dialogs.md` (Avoidance Mechanism 5: Desktop WebView2 & Electron UI Safety)
- `.agents/rules/junction-lifecycle.md` (Avoidance Mechanism 6: Safe Junction, Symlink & Directory Lifecycle)
- `.agents/rules/watcher-throttling.md` (Avoidance Mechanism 7: Watcher Throttling & Descriptor Protection)
Do NOT modify files outside `.agents/rules/` in this milestone.

IMPLEMENTATION INSTRUCTIONS:
1. Every rule file must start with valid YAML frontmatter:
   ```yaml
   ---
   trigger: always_on
   description: "Descriptive summary"
   ---
   ```
2. Populate each topic file with the complete, production-grade avoidance mechanism specifications, agent crash vectors (Antigravity Go junction bug, CORTEX_MEMORY_TRIGGER_UNSPECIFIED, Claude Code .claude.json.asm-bak, Cursor MDC, OpenCode effect schema, Copilot servers key, etc.), and code invariants detailed in `m1_rules_blueprint.md`, `m1_explorer_1_report.md`, and `m1_explorer_2_report.md`.
3. Update `agent-safety-invariants.md` with YAML frontmatter, executive summary, and a clear index linking to all 7 modular files.
4. Run tests using `rtk npm test` to verify that all 41 existing test suites pass cleanly with zero failures.

OUTPUT REQUIREMENTS:
- Write your handoff report to:
  d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_worker_m1\handoff.md
- Maintain liveness via progress.md in your directory.
- When finished, send a message to your parent orchestrator (56e62fe3-5ba5-4e9d-8c31-b82ec2cab8ad).
