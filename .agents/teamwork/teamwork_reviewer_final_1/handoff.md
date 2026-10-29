# Final Review & Adversarial Audit Report — Agent Space Manager (R1–R5)

**Reviewer**: teamwork_reviewer_final_1  
**Roles**: reviewer, critic  
**Timestamp**: 2026-10-29T10:08:00Z  
**Verdict**: **REQUEST_CHANGES**

---

## Review Summary

While Requirements R1, R2, and R3 are solidly implemented in production code (`page/index.html`, `page/app.js`, `manager.mjs`), the full automated test suite (`npm test`) **currently fails with 5 errors (exit code 1)**. In addition, adversarial analysis uncovered discrepancies where production implementations omit functions or error-handling branches explicitly documented in Safety Invariants 2 and 4.

| Requirement | Description | Status | Findings |
|---|---|:---:|---|
| **R1** | Manual Connection Trigger & UI Placement | **PASS** | `#connectBtn` is directly to the right of `#rescanBtn`; connections only initiate on manual click. |
| **R2** | Component Default State & Preference Persistence | **PASS** | Components default to disabled (`=== true`); preferences persist per agent in `hubConfig.ides`. |
| **R3** | Single Connection Bridge Replacement | **PASS** | Deduplication in `manager.mjs` prevents duplicate agents and canonicalizes IDs; differential sync updates single bridge. |
| **R4** | Test Suite Improvements & 100% Pass Rate | **FAIL** | Running `rtk npm test` executes `tests/adversarial-stress.test.mjs`, which produces **5 test failures** (exit code 1). |
| **R5** | Modular Safety Invariants & Avoiding Crashes | **FAIL** | Discrepancies found: `adapters.mjs:659` fails to export `toOpenCodeMcpEntry`; `manager.mjs:1146` fails to prune unparseable syntax-error JSON manifests. |

---

## 1. Observations

### 1.1 `rtk npm test` Execution Failure
Executing `rtk npm test` in workspace `d:\Software\Magpie\agent-space-manager`:
```
> node --test --test-reporter=spec "tests/*.test.mjs"
ℹ tests 65
ℹ suites 12
ℹ pass 60
ℹ fail 5
ℹ cancelled 0
ℹ duration_ms 1145.5637
Command exited with code 1.
```
Specific failure traces:
1. `tests/adversarial-stress.test.mjs:24:3`:
   `TypeError: m.getStateDir is not a function` at line 124:26.
2. `tests/adversarial-stress.test.mjs:214:3`:
   `AssertionError [ERR_ASSERTION]: Must update existing test-agent in place: 2 !== 1` at line 264:14.
3. `tests/adversarial-stress.test.mjs:288:3`:
   `AssertionError [ERR_ASSERTION]: Syntax error file must be pruned: true !== false` at line 338:14.
4. `tests/adversarial-stress.test.mjs:416:3`:
   `TypeError: adapters.normalizeRuleContent is not a function` at line 420:33.
5. `tests/adversarial-stress.test.mjs:432:3`:
   `TypeError: adapters.toOpenCodeMcpEntry is not a function` at line 436:33.

### 1.2 Missing Export in `adapters.mjs` (Safety Invariant 4)
- **Documented in `.agents/rules/mcp-schema-guards.md:27`**:
  ```javascript
  export function toOpenCodeMcpEntry(def) { ... }
  ```
- **Observed in `adapters.mjs:659`**:
  ```javascript
  function toOpenCodeMcpEntry(def) { ... }
  ```
  The function lacks the `export` keyword, preventing external callers and test suites from verifying OpenCode MCP conversion.

### 1.3 Unparseable JSON Manifests Left Unpruned in `manager.mjs` (Safety Invariant 2)
- **Documented in `.agents/rules/config-sanitization.md:52`**:
  ```javascript
  } catch {
    // Unparseable / corrupted JSON files are pruned
    try { fs.unlinkSync(p); } catch {}
  }
  ```
- **Observed in `manager.mjs:1142-1146`**:
  ```javascript
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === "object" && !parsed.id) {
      fs.unlinkSync(p);
    }
  } catch {}
  ```
  When `JSON.parse(content)` encounters a syntax error (e.g. truncated `{"id": "unclosed-json`), the catch block is a no-op `catch {}`. The corrupted JSON manifest remains on disk in `~/.gemini/config/projects/`, crashing Antigravity's project scanner upon launch.

### 1.4 Flawed Assumptions in `tests/adversarial-stress.test.mjs`
- Test 1 calls `m.getStateDir()`. In `manager.mjs`, `getStateDir` is an imported helper from `adapters.mjs`, not an export.
- Test 3 checks `assert.equal(hubConfig.ides.length, 1)` after Case B already added `{ id: "custom" }` to `hubConfig.ides` in the same sandbox instance, causing length to be 2.
- Test 5 expects `adapters.normalizeRuleContent`, which does not exist in `adapters.mjs` (it is handled internally within `syncOwnedFiles`).

---

## 2. Logic Chain

1. **Test Suite Integrity Rule**: Requirement R4 mandates: *"Ensure all tests run and pass cleanly... Running `rtk npm test` passes 100% of tests with zero failures."*
2. **Current State**: `package.json` runs `node --test --test-reporter=spec "tests/*.test.mjs"`. Because `tests/adversarial-stress.test.mjs` was introduced to `tests/`, `npm test` automatically includes it.
3. **Failure Cause Analysis**:
   - 2 failures are caused by actual implementation omissions in `adapters.mjs` (`toOpenCodeMcpEntry` not exported) and `manager.mjs` (`catch {}` in `sanitizeAgentConfigDirectory` not unlinking unparseable JSON files).
   - 3 failures are caused by incorrect test harness assumptions in `tests/adversarial-stress.test.mjs` (`m.getStateDir` import, state accumulation in Case B vs D, nonexistent `normalizeRuleContent`).
4. **Safety Invariant Divergence**: Safety Invariant 2 (`config-sanitization.md`) and Safety Invariant 4 (`mcp-schema-guards.md`) provide canonical code snippets that were not accurately mirrored in production modules.
5. **Conclusion**: Code changes must be requested to fix the export in `adapters.mjs`, fix the syntax error pruning in `manager.mjs`, and correct or clean up `tests/adversarial-stress.test.mjs` so that `rtk npm test` passes with 100% success rate.

---

## 3. Caveats

- When running exclusively the original 11 test suites (e.g. `node --test tests/connection-lifecycle.test.mjs tests/sync-bundle.test.mjs ...`), all 57 tests pass with 100% pass rate.
- Requirements R1, R2, and R3 themselves have zero regressions and pass all verification checks.
- The 5 failures are confined to the newly added `tests/adversarial-stress.test.mjs` and the two exposed implementation discrepancies.

---

## 4. Conclusion & Actionable Findings

### Finding 1: [Critical] `rtk npm test` fails with exit code 1
- **Where**: `tests/adversarial-stress.test.mjs`
- **Why**: Violates Acceptance Criteria R4 (100% pass rate on `npm test`).
- **Suggestion**: Resolve the 5 failures in `tests/adversarial-stress.test.mjs` and the underlying implementation issues.

### Finding 2: [Major] Missing `export` on `toOpenCodeMcpEntry` in `adapters.mjs`
- **Where**: `adapters.mjs:659`
- **Why**: Violates Safety Invariant 4 specification; prevents programmatic schema conversion validation.
- **Suggestion**: Export the function: `export function toOpenCodeMcpEntry(def) { ... }`.

### Finding 3: [Major] `sanitizeAgentConfigDirectory` fails to delete unparseable JSON syntax errors
- **Where**: `manager.mjs:1146`
- **Why**: Incomplete catch block leaves corrupted JSON manifests on disk, violating Safety Invariant 2.
- **Suggestion**: Update catch block to:
  ```javascript
  } catch {
    try { fs.unlinkSync(p); } catch {}
  }
  ```

### Finding 4: [Minor] Test harness bugs in `tests/adversarial-stress.test.mjs`
- **Where**: `tests/adversarial-stress.test.mjs` lines 124, 264, 420
- **Why**: Test imports `getStateDir` from wrong module, makes invalid array length assertion, and calls nonexistent `normalizeRuleContent`.
- **Suggestion**: Correct imports to `import { getStateDir } from "../adapters.mjs"`, reset `hubConfig.ides` between edge cases, and test rule frontmatter normalization via `adapters.syncOwnedFiles` or export a dedicated helper.

---

## 5. Verification Method

To verify the remediation:
1. Run terminal command:
   ```bash
   rtk npm test
   ```
2. Verify output ends with:
   - `ℹ fail 0`
   - Exit code `0`.
3. Inspect `adapters.mjs:659` to verify `export function toOpenCodeMcpEntry`.
4. Inspect `manager.mjs:1146` to verify `fs.unlinkSync(p)` inside `catch`.
