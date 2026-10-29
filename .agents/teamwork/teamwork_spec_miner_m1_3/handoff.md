# Handoff Report: Milestone 1 (Modular Safety Invariants Specification)

**Agent**: `teamwork_spec_miner_m1_3`  
**Date**: 2026-10-29  
**Type**: Hard Handoff (Specification Task Complete)  
**Target Blueprint**: `d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_spec_miner_m1_3\m1_rules_blueprint.md`  

---

## 1. Observation

Direct empirical observations from inspecting the codebase, configuration, tests, and existing rules:

1. **Existing Safety Rules File**:
   - File: `d:\Software\Magpie\agent-space-manager\.agents\rules\agent-safety-invariants.md`
   - Total lines: 42 lines.
   - Frontmatter (lines 1-4):
     ```yaml
     ---
     trigger: always_on
     description: "Universal safety invariants for multi-IDE component orchestration, process protection, and schema sanitization in Agent Space Manager"
     ---
     ```
   - Current content provides high-level rules for 6 topics (Process Termination, Schema Sanitization, Rule Normalization, WebView2 Dialogs, Junction Lifecycle, Watcher Throttling), but lacks agent-specific crash vectors, detailed code citations, and does not separate MCP schema guards into its own topic.

2. **Process Termination Invariant**:
   - File: `d:\Software\Magpie\agent-space-manager\manager.mjs`
   - Lines 1501-1527:
     ```javascript
     export function killAgentProcesses(ide) {
       if (!ide) return { success: true };
       if (process.env.NODE_ENV === "test" || process.env.ASM_TEST === "1") {
         return { success: true, skipped: "test-environment" };
       }
       const normalized = normalizeIdeEntry(ide);
       const type = normalized.agentType || inferAgentType(normalized);

       const PROTECTED_GUI_AGENTS = new Set([
         "antigravity", "cursor", "windsurf", "vscode", "vscode-copilot",
         "vscodium", "opencode", "kiro", "gemini-cli", "cline", "roo-code",
       ]);

       if (PROTECTED_GUI_AGENTS.has(type) && !normalized.forceKill) {
         return { success: true, skipped: "gui-editor-hot-reload-protected" };
       }
     ```
   - Lines 1530-1543 list protected executable names (`antigravity.exe`, `cursor.exe`, `windsurf.exe`, `code.exe`, `opencode.exe`, etc.).
   - Lines 1558-1564 execute graceful `taskkill /IM "${procName}"` without forceful `/F` / `/T` flags.

3. **Config Sanitization Invariant**:
   - File: `d:\Software\Magpie\agent-space-manager\manager.mjs`
   - Lines 1074-1120 define `sanitizeAgentConfigDirectory(configDir, agentType)`.
   - Lines 1084-1098 detect and delete 0-byte `.json` files (`st.size === 0`), empty `{}` files (`content === "{}"`), and manifests missing required `id` (`!parsed.id`).
   - Lines 1103-1118 detect and prune 0-child ghost directories in `plugins/` and `skills/`.

4. **Rule Normalization & Frontmatter Invariant**:
   - File: `d:\Software\Magpie\agent-space-manager\adapters.mjs`
   - Lines 938-955 in `syncOwnedFiles`:
     ```javascript
     } else if (format === "antigravity-rule") {
       const raw = fs.readFileSync(srcFile, "utf8");
       const { frontmatter, body } = parseMarkdownFrontmatter(raw);
       const desc = (frontmatter.description || `Rule ${path.basename(destResolved, suffix)}`)
         .replace(/\r?\n/g, " ")
         .trim();
       const trigger = frontmatter.trigger || "always_on";
       const formatted = [
         "---",
         `description: ${JSON.stringify(desc)}`,
         `trigger: ${trigger}`,
         "---",
         "",
         body,
         "",
       ].join("\n");
       fs.writeFileSync(destResolved, formatted, "utf8");
     ```
   - Lines 16-19 and 870-877 define markdown delimiters (`<!-- agent-space-manager:start -->` / `<!-- agent-space-manager:end -->`) and TOML delimiters (`# >>> agent-space-manager` / `# <<< agent-space-manager`).

5. **MCP Schema Transformations & Root Key Normalization**:
   - File: `d:\Software\Magpie\agent-space-manager\agents.mjs`
   - Line 195: VS Code Copilot specifies `key: "servers"`.
   - File: `d:\Software\Magpie\agent-space-manager\adapters.mjs`
   - Lines 655-677 define `toOpenCodeMcpEntry(def)` which converts `{ command, args, env }` into `{ type: "local", command: [...], environment: { ... } }`.
   - Lines 680-720 define `syncJsonMcpServers(mcpSpec, mcpServers, prevOwnedKeys)` which creates `.asm-bak` backups and prunes only previously owned keys, preserving user custom keys.

6. **WebView2 Dialog Suppression & 2-Step Inline Confirmation**:
   - File: `d:\Software\Magpie\agent-space-manager\page\app.js`
   - Lines 1349-1367 and 1220-1227 implement the 2-step confirmation pattern:
     ```javascript
     if (deleteProjBtn.dataset.confirming !== "true") {
       deleteProjBtn.dataset.confirming = "true";
       deleteProjBtn.textContent = "Click to Confirm";
       deleteProjBtn.style.color = "#ef4444";
       deleteProjBtn.style.fontWeight = "bold";

       if (confirmProjTimer) clearTimeout(confirmProjTimer);
       confirmProjTimer = setTimeout(() => {
         if (deleteProjBtn) {
           delete deleteProjBtn.dataset.confirming;
           delete deleteProjBtn.textContent = "Remove";
           delete deleteProjBtn.style.color = "";
           delete deleteProjBtn.style.fontWeight = "";
         }
       }, 4000);
       return;
     }
     ```
   - Zero occurrences of `window.confirm()` or `window.alert()`.

7. **Junction Lifecycle, Materialization & Ownership Tracking**:
   - File: `d:\Software\Magpie\agent-space-manager\adapters.mjs`
   - Lines 239-245 define `isAsmOwnedDirectory(dirPath)` checking for `.asm-owned.json`.
   - Lines 251-346 define `materializeSkillDir` and `materializePluginBundle` creating real NTFS directories with `.asm-owned.json` on Windows to bypass Go runtime `os.ReadDir` `IsDir() == false` bugs.

8. **Watcher Throttling & Storage Snapshot Fingerprinting**:
   - File: `d:\Software\Magpie\agent-space-manager\manager.mjs`
   - Lines 1732-1960 define `getComponentsStorageSnapshot(hubRoot)` which indexes components, computes SHA-256 canonical hash, and ignores `.git` and `node_modules`.
   - Lines 968-980 in `adapters.mjs` sync `.git/info/exclude` via `ensureGitInfoExclude`.

9. **Current Test Suite Baseline**:
   - Running `rtk npm test` executes 41 tests across 10 test suites in 859ms with 0 failures:
     `ℹ tests 41, ℹ suites 10, ℹ pass 41, ℹ fail 0`.

---

## 2. Logic Chain

1. From Observation 1, the user request R5 requires modularizing the monolithic `agent-safety-invariants.md` into topic-specific markdown files in `.agents/rules/` categorized by avoidance mechanism, while maintaining `agent-safety-invariants.md` as the master index.
2. From Observations 2 through 8, the existing codebase implements 7 distinct, rigorous crash avoidance mechanisms:
   - Topic 1: Process Safety & GUI Editor Lifecycle Protection (`manager.mjs:1501-1569`)
   - Topic 2: Configuration & Schema Sanitization (`manager.mjs:1074-1120`, `.asm-bak`)
   - Topic 3: Rule Normalization, Metadata Triggers & Syntax Guards (`adapters.mjs:938-955`, Cortex `trigger: always_on`, delimiter blocks)
   - Topic 4: Cross-Agent MCP Schema Compatibility & Key Normalization (`agents.mjs:195`, `adapters.mjs:655-677`, OpenCode schema, Copilot `servers` key)
   - Topic 5: Desktop WebView2 & Electron UI Interaction Standards (`page/app.js:1349-1367`, 2-step inline confirmation, zero native dialogs)
   - Topic 6: Junction Lifecycle, Directory Materialization & Ownership Tracking (`adapters.mjs:239-346`, Go `os.ReadDir` fix, `.asm-owned.json`)
   - Topic 7: Watcher Throttling, Debounce & Descriptor Protection (`manager.mjs:1732-1960`, snapshot hashing, `.git/info/exclude`)
3. From Observation 4, any rule processed by the Antigravity Cortex memory engine or metadata indexers must include YAML frontmatter (`trigger: always_on`, descriptive summary) to avoid triggering `CORTEX_MEMORY_TRIGGER_UNSPECIFIED`. Therefore, every modular file in `.agents/rules/` must include YAML frontmatter.
4. From Observation 9, the test suite currently verifies the underlying implementation functions (`killAgentProcesses`, `sanitizeAgentConfigDirectory`, `materializePluginBundle`, `getComponentsStorageSnapshot`, OpenCode MCP transforms). Creating the markdown documentation files in `.agents/rules/` will not break any tests, provided YAML frontmatter is valid.
5. Therefore, a complete specification and worker blueprint (`m1_rules_blueprint.md`) has been drafted with the exact structure, YAML frontmatter, rationale, crash vectors, and code patterns for all 8 files (master index + 7 topics), providing an unambiguous roadmap for the Worker agent.

---

## 3. Caveats

- **Read-Only Invariant**: As a specification miner, this agent did NOT write or modify files in `.agents/rules/` or production code. All deliverables are restricted to `.agents/teamwork/teamwork_spec_miner_m1_3/`.
- **Existing Rules in Directory**: `.agents/rules/` already contains `antigravity-rtk-rules.md` (RTK Token Saver rule). This file must be preserved as-is by the Worker.

---

## 4. Conclusion

Milestone 1 specification mining is complete. The comprehensive specification and Worker blueprint has been written to:
`d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_spec_miner_m1_3\m1_rules_blueprint.md`.

It specifies:
1. The update to `d:\Software\Magpie\agent-space-manager\.agents\rules\agent-safety-invariants.md` as the master index with valid YAML frontmatter, an executive summary, and a navigation matrix.
2. The exact specifications for all 7 topic files to be created in `.agents/rules/`:
   - `process-termination.md`
   - `config-sanitization.md`
   - `rule-normalization.md`
   - `mcp-schema-guards.md`
   - `webview2-dialogs.md`
   - `junction-lifecycle.md`
   - `watcher-throttling.md`
3. Each file includes YAML frontmatter (`trigger: always_on`), architectural rationale, agent-specific crash vectors for all 13 supported profiles, and exact code invariants with repository citations.

The Worker agent can execute this blueprint directly without ambiguity.

---

## 5. Verification Method

To verify the deliverables of this specification task:
1. Inspect the blueprint file:
   `d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_spec_miner_m1_3\m1_rules_blueprint.md`
   Confirm that all 8 files are specified in complete detail.
2. Confirm test baseline stability:
   Run `rtk npm test` in the workspace root. Confirm 41 tests pass with 0 failures.
3. Invalidation condition:
   If any file in Section 3 of the blueprint lacks YAML frontmatter (`trigger: always_on`), or fails to cover agent-specific crash vectors, this handoff is invalidated.
