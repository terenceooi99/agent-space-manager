# BRIEFING — 2026-10-29T16:03:30Z

## Mission
Specify the complete file-by-file specification and blueprint for Milestone 1 (Modular Safety Invariants in `.agents/rules/`).

## 🔒 My Identity
- Archetype: specification_miner
- Roles: Teamwork specialist, external domain expert, specification miner
- Working directory: d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_spec_miner_m1_3
- Original parent: 56e62fe3-5ba5-4e9d-8c31-b82ec2cab8ad
- Milestone: Milestone 1 (Modular Safety Invariants)

## 🔒 Key Constraints
- Read-only on source code — do not implement changes to production files.
- Produce comprehensive blueprint in `m1_rules_blueprint.md`.
- Produce 5-component handoff report in `handoff.md`.
- Maintain liveness via `progress.md`.
- Master index: `.agents/rules/agent-safety-invariants.md` must have valid YAML frontmatter (`trigger: always_on`, descriptive summary), executive summary, and index of 7 topic files.
- 7 topic files in `.agents/rules/`:
  1. `process-termination.md`
  2. `config-sanitization.md`
  3. `rule-normalization.md`
  4. `mcp-schema-guards.md`
  5. `webview2-dialogs.md`
  6. `junction-lifecycle.md`
  7. `watcher-throttling.md`
- Each must have YAML frontmatter (`trigger: always_on`), rationale, agent-specific crash vectors, and exact code invariants.
- Notify parent orchestrator via `send_message`.

## Current Parent
- Conversation ID: 56e62fe3-5ba5-4e9d-8c31-b82ec2cab8ad
- Updated: not yet

## Task Summary
- **What to build**: Blueprint for Milestone 1 modular safety invariants specification.
- **Success criteria**: Detailed file-by-file content, frontmatter, rationale, agent-specific crash vectors, and code patterns for all 8 rule files (master index + 7 topics), ready for Worker to implement.
- **Interface contracts**: PROJECT.md, ORIGINAL_REQUEST.md, survey_tests_and_rules.md
- **Code layout**: .agents/rules/

## Key Decisions Made
- Investigated existing codebase patterns: `manager.mjs`, `adapters.mjs`, `agents.mjs`, `page/app.js`, `tests/`.
- Validated baseline tests: all 41 existing tests across 10 suites pass cleanly with zero failures.
- Synthesized 15 discovered features and 12 edge cases.
- Drafted exhaustive file-by-file blueprint in `m1_rules_blueprint.md` for the Worker agent to execute Milestone 1 cleanly.
- Produced comprehensive 5-component handoff report in `handoff.md`.

## Artifact Index
- DISPATCH.md — Orchestrator dispatch instructions
- progress.md — Liveness heartbeat and milestone tracking
- m1_rules_blueprint.md — Complete file specifications and worker blueprint
- handoff.md — 5-component handoff report
