## 2026-10-29T07:44:26Z
You are teamwork_spec_miner_survey_3, working as part of the orchestration team for Agent Space Manager.
Your working directory is: d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_spec_miner_survey_3
Your parent orchestrator conversation ID is: 56e62fe3-5ba5-4e9d-8c31-b82ec2cab8ad

MANDATORY FIRST STEP:
Read ORIGINAL_REQUEST.md at:
d:\Software\Magpie\agent-space-manager\.agents\teamwork\ORIGINAL_REQUEST.md

YOUR MISSION:
Perform a comprehensive technical survey and specification mining regarding Requirements R4 and R5:
- R4: Test Suite Improvements (Improve the automated test suite (`npm test`) with new or updated unit/integration tests verifying the manual connection flow, component default and persistence state, and bridge replacement behavior. Ensure all tests run and pass cleanly).
- R5: Safety Invariant Research and Modular Avoidance Rules (Research documentation for major supported agents in Agent Space Manager [e.g., Antigravity, Cursor, Windsurf, Claude Code/Desktop, OpenCode] to identify plugin/rule conflict and crash avoidance mechanisms. Expand or amend `agent-safety-invariants.md` and split rules into modular topic-specific markdown files in `.agents/rules/` categorized by avoidance mechanism, keeping `agent-safety-invariants.md` as the index and reference point).

INVESTIGATION DETAILS:
1. Examine `package.json`, test scripts, test framework (e.g. Mocha, Jest, Vitest, Node test runner), test files in `tests/`, test utilities, and mocks.
2. Check how `npm test` runs, what tests currently pass/fail, and how tests isolate filesystem/process operations (e.g. `ASM_TEST=1`, `NODE_ENV=test`).
3. Survey what tests are missing for R1 (manual connect button triggering), R2 (components default unchecked, preference persistence), and R3 (bridge replacement without duplicates or resource leaks).
4. Survey `.agents/rules/agent-safety-invariants.md` and codebase rules. Research official docs or specifications for supported agents (Antigravity, Cursor, Windsurf, Claude Code, OpenCode) on:
   - Process safety & editor lifecycle (never killing GUI editors)
   - Configuration schema sanitization (no 0-byte JSON stubs)
   - Rule normalization & YAML frontmatter triggers (preventing parser crashes)
   - Desktop WebView2/Electron dialog suppression
   - Junction, symlink, and file ownership lifecycle
   - Watcher throttling & file-descriptor exhaustion
   - Any new avoidance mechanisms for specific agents
5. Design the modular file structure under `.agents/rules/` categorized by avoidance mechanism (e.g. `process-termination.md`, `config-sanitization.md`, `rule-normalization.md`, `webview2-dialogs.md`, `junction-lifecycle.md`, `watcher-throttling.md`) and how `agent-safety-invariants.md` will index them.

OUTPUT REQUIREMENTS:
- Write your findings, specifications, and test plan into:
  d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_spec_miner_survey_3\survey_tests_and_rules.md
- Write your handoff report to:
  d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_spec_miner_survey_3\handoff.md
- Maintain liveness via progress.md in your directory.
- When finished, send a message to your parent orchestrator (56e62fe3-5ba5-4e9d-8c31-b82ec2cab8ad) informing completion and pointing to the artifacts.
