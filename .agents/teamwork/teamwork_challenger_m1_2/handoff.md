# Milestone 1 Adversarial Challenge Report: Modular Safety Invariants (Requirement R5)

**Challenger**: `teamwork_challenger_m1_2`  
**Working Directory**: `d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_challenger_m1_2`  
**Parent Orchestrator ID**: `56e62fe3-5ba5-4e9d-8c31-b82ec2cab8ad`  
**Date**: 2026-10-29  
**Verdict**: **APPROVE**  

---

## 1. Observation

Direct empirical observations made across the workspace, rule specifications, codebase implementation files, and test runs:

1. **Existence and Integrity of Modular Rule Files**:
   Confirmed all 8 files exist in `.agents/rules/`:
   - `.agents/rules/agent-safety-invariants.md` (Master index)
   - `.agents/rules/process-termination.md` (Invariant 1)
   - `.agents/rules/config-sanitization.md` (Invariant 2)
   - `.agents/rules/rule-normalization.md` (Invariant 3)
   - `.agents/rules/mcp-schema-guards.md` (Invariant 4)
   - `.agents/rules/webview2-dialogs.md` (Invariant 5)
   - `.agents/rules/junction-lifecycle.md` (Invariant 6)
   - `.agents/rules/watcher-throttling.md` (Invariant 7)

2. **YAML Frontmatter Verification**:
   Executed a Node.js verification script inspecting lines 1-4 of all `.agents/rules/*.md` files. Every one of the 8 modular files starts on line 1 with valid YAML frontmatter containing `trigger: always_on` and a non-empty `description`:
   ```yaml
   ---
   trigger: always_on
   description: "..."
   ---
   ```
   (The pre-existing `.agents/rules/antigravity-rtk-rules.md` file was preserved untouched.)

3. **Codebase Implementation Cross-Check**:
   Every code reference, function name, and line range cited in the rules was checked against the actual codebase:
   - **`killAgentProcesses`** (`process-termination.md`): Verified in `manager.mjs:1501-1570`. Confirmed `PROTECTED_GUI_AGENTS` (lines 1511-1523), `PROTECTED_EXECUTABLES` (lines 1530-1543), test environment bypass (line 1503), and graceful signal usage (`taskkill /IM` without `/F` or `/T`, lines 1558-1563).
   - **`sanitizeAgentConfigDirectory`** (`config-sanitization.md`): Verified in `manager.mjs:1074-1120`. Confirmed deletion of 0-byte JSON files, `{}` stubs missing `"id"`, and empty ghost folders in `plugins/` and `skills/`. Cross-checked against unit test in `tests/detect.test.mjs:56-85`.
   - **`ensureBackupOnce`** (`config-sanitization.md`): Verified in `adapters.mjs:695` and `manager.mjs:1612`, creating `.asm-bak` without overwriting existing user backups.
   - **Rule Frontmatter Normalization** (`rule-normalization.md`): Verified in `adapters.mjs:922-957`. Confirmed default `trigger = frontmatter.trigger || "always_on"`, `JSON.stringify(desc)`, and OpenCode `mode: "subagent"`.
   - **Cross-Agent MCP Key & Schema Guard** (`mcp-schema-guards.md`):
     - Confirmed VS Code Copilot root key `key: "servers"` in `agents.mjs:195` and line 205.
     - Confirmed OpenCode schema transformation `toOpenCodeMcpEntry` in `adapters.mjs:655-677` (single array `command`, `environment` key, `enabled: true`, `null` if command/url empty).
     - Confirmed Codex CLI TOML table generation and key quoting in `adapters.mjs:802`.
   - **WebView2 Non-Blocking UI Confirmations** (`webview2-dialogs.md`):
     - Confirmed 2-step inline confirmation pattern in `page/app.js:1204-1218` (agent removal) and `page/app.js:1350-1364` (project removal) with 4000ms auto-reset timers.
     - Verified zero usage of `window.confirm()` anywhere in `page/`.
     - Observed legacy `alert(...)` calls at `page/app.js:2294, 2331`, which `webview2-dialogs.md` explicitly calls out for migration to inline validation messages in UI updates.
   - **Windows NTFS Junction Lifecycle & Materialization** (`junction-lifecycle.md`):
     - Confirmed Go `os.ReadDir` bug workaround via `materializeSkillDir` and `materializePluginBundle` in `adapters.mjs:251-346`.
     - Confirmed junction severance via `cmd.exe /c rmdir "${linkPath}"` with fallback to `fs.unlinkSync` in `manager.mjs:1016-1025`.
     - Confirmed `.asm-owned.json` ownership check in `adapters.mjs:239-245`.
     - Verified integration test in `tests/sync-bundle.test.mjs:104-133`.
   - **Watcher Throttling** (`watcher-throttling.md`):
     - Confirmed polling interval >= 2000ms with `.unref()` in `server.mjs:173-178`.
     - Confirmed deterministic SHA-256 snapshot checking via `getComponentsStorageSnapshot` in `manager.mjs:1732-1760`.
     - Confirmed `.git/info/exclude` synchronization via `ensureGitInfoExclude` in `adapters.mjs:968-980`.

4. **Empirical Test Suite Execution**:
   Ran `rtk npm test` synchronously:
   ```
   ℹ tests 41
   ℹ suites 10
   ℹ pass 41
   ℹ fail 0
   ℹ cancelled 0
   ℹ skipped 0
   ℹ todo 0
   ℹ duration_ms 686.8407
   ```
   100% of test suites passed cleanly with 0 regressions.

---

## 2. Logic Chain

1. **Requirement Satisfaction**:
   - Requirement R5 (`ORIGINAL_REQUEST.md:24-26`) requires researching supported agent documentation to identify crash avoidance mechanisms, amending `agent-safety-invariants.md`, and splitting rules into modular topic-specific files categorized by avoidance mechanism in `.agents/rules/`.
   - Observation 1 and 2 prove that all 7 topic-specific avoidance files exist, each strictly isolated by avoidance mechanism, beginning with YAML frontmatter to satisfy Google Antigravity Cortex memory engine rules, with `agent-safety-invariants.md` serving as the master index.

2. **Technical Grounding**:
   - The primary risk in safety rules is divergence from implementation (prescribing practices the codebase does not support or citing non-existent functions).
   - Observation 3 proves that every function, method signature, line reference, regex guard, and test citation in all 8 files accurately reflects the actual implementation in `manager.mjs`, `adapters.mjs`, `agents.mjs`, `page/app.js`, and `server.mjs`.

3. **Absence of Conflicting Directives**:
   - The rules were stress-tested for inter-agent or inter-rule conflicts:
     - *MCP Keys*: VS Code Copilot uses `"servers"`, OpenCode uses `"mcp"`, Codex uses TOML tables `[mcp_servers]`, and others use `"mcpServers"`. These target separate files and schemas with no collision.
     - *Rule Files*: Antigravity uses frontmatter rules, Cursor uses `.mdc`, Claude uses `CLAUDE.md`, Windsurf uses `global_rules.md`, and Codex uses `AGENTS.md`. Each target agent uses distinct formats and paths.
     - *Sanitization & Preservation*: User-owned files without `.asm-owned.json` are strictly preserved, while empty `{}` stubs and 0-byte files that crash LSPs are pruned. Delimited comments protect monolithic user configurations.
   - No conflicting or contradictory directives exist across the modular rule suite.

4. **Test Suite Integrity**:
   - Running `rtk npm test` confirms that the codebase and rules remain in perfect sync with 41 passing tests across 10 test suites and 0 failures.

---

## 3. Caveats

- **Scope Boundary**: Milestone 1 is confined to Requirement R5 (Modular Safety Invariants & Rules). Verification does not validate backend connection changes (Milestone 2), frontend Connect button additions (Milestone 3), or new lifecycle tests (Milestone 4).
- **GUI Form Alerts**: `page/app.js:2294, 2331` still contains two legacy `alert(...)` calls in the manual agent/project add forms. As documented in `webview2-dialogs.md`, these should be replaced with inline field validation in subsequent UI milestones.

---

## 4. Conclusion

**Verdict: APPROVE**

Milestone 1 satisfies all criteria for Requirement R5:
- 7 modular avoidance rules created in `.agents/rules/` categorized by mechanism.
- `agent-safety-invariants.md` acts as a clean master index and navigation matrix.
- All files include valid YAML frontmatter (`trigger: always_on`).
- Codebase implementations and citations are 100% verified and empirically accurate.
- Zero rule conflicts identified.
- Automated test suite passes 100% cleanly (41/41 tests passing).

Milestone 1 is ready for final sign-off to proceed to Milestone 2.

---

## 5. Verification Method

To independently reproduce this verification:

1. **Verify All Modular Rule Files and Frontmatter**:
   ```powershell
   rtk node -e "const fs=require('fs'), p=require('path'); const d=p.join('.agents','rules'); fs.readdirSync(d).filter(f=>f.endsWith('.md')).forEach(f=>console.log(f, fs.readFileSync(p.join(d,f),'utf8').slice(0,30).replace(/\r?\n/g,' ')))"
   ```
   Confirm all 8 safety rule files report `--- trigger: always_on`.

2. **Verify Code Cross-References**:
   - Check `killAgentProcesses` in `manager.mjs:1501-1570`.
   - Check `sanitizeAgentConfigDirectory` in `manager.mjs:1074-1120`.
   - Check `materializePluginBundle` in `adapters.mjs:290-346`.
   - Check `toOpenCodeMcpEntry` in `adapters.mjs:655-677`.
   - Check inline confirmations in `page/app.js:1204-1218, 1350-1364`.

3. **Run Automated Test Suite**:
   ```powershell
   rtk npm test
   ```
   Confirm all 41 tests across 10 suites pass with 0 failures.
