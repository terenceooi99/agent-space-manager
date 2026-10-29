# E2E Test Infra: Agent Space Manager Connection Flow & Modular Safety Invariants

## Test Philosophy
- Opaque-box, requirement-driven. Derived from ORIGINAL_REQUEST.md.
- Methodology: Category-Partition + Boundary Value Analysis + Pairwise Combinatorial + Real-World Workload Testing.

## Feature Inventory & Test Matrix
| # | Feature | Source (Requirement) | Tier 1 (Feature) | Tier 2 (Boundary) | Tier 3 (Cross-Feature) |
|---|---------|----------------------|:----------------:|:-----------------:|:----------------------:|
| 1 | R1: Manual Connection Trigger & Placement | ORIGINAL_REQUEST § R1 | 5 | 5 | ✓ |
| 2 | R2: Component Default Unchecked & Persistence | ORIGINAL_REQUEST § R2 | 5 | 5 | ✓ |
| 3 | R3: Single Connection Bridge Replacement | ORIGINAL_REQUEST § R3 | 5 | 5 | ✓ |
| 4 | R5: Modular Safety Invariants & Indexing | ORIGINAL_REQUEST § R5 | 5 | 5 | ✓ |

## Test Architecture
- **Test Runner**: Node.js native test runner via `rtk npm test` (`node --test --test-reporter=spec "tests/*.test.mjs"`).
- **Environment Isolation**: `ASM_TEST=1`, `NODE_ENV=test`, sandbox scratch directories via `makeSandbox()` in `tests/helpers.mjs`.
- **Primary Integration Test Suite**: `tests/connection-lifecycle.test.mjs`.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Clean startup, discover agents, verify all components default disabled | R1, R2 | Medium |
| 2 | User toggles components for Antigravity, restarts app, verifies persistence | R2 | Medium |
| 3 | User connects Antigravity with Skill A via manual Connect button | R1, R2, R3 | High |
| 4 | User reconnects Antigravity with Skill B, replacing bridge without duplication or bloat | R1, R2, R3 | High |
| 5 | Modular safety rules exist, are valid YAML frontmatter markdown, indexed by agent-safety-invariants.md | R5 | Medium |

## Coverage Thresholds
- Minimum 41 baseline tests maintained.
- New test suites covering all Tier 1-4 scenarios.
- 100% pass rate on `rtk npm test` with zero failures.
