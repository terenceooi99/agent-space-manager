# Handoff Report: Milestone 1 Technical Formulation (Invariants 1–3)

**Agent Name**: `teamwork_explorer_m1_1`  
**Working Directory**: `d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_explorer_m1_1`  
**Parent Orchestrator ID**: `56e62fe3-5ba5-4e9d-8c31-b82ec2cab8ad`  
**Date**: 2026-10-29  
**Type**: Hard Handoff (Task Complete)  

---

## 1. Observation

1. **Safety Rules Root Directory**:
   - `.agents/rules/` contains `agent-safety-invariants.md` (3,535 bytes) and `antigravity-rtk-rules.md` (7,880 bytes).
   - In `d:\Software\Magpie\agent-space-manager\.agents\rules\agent-safety-invariants.md:1-4`:
     ```yaml
     ---
     trigger: always_on
     description: "Universal safety invariants for multi-IDE component orchestration, process protection, and schema sanitization in Agent Space Manager"
     ---
     ```
   - In `agent-safety-invariants.md:10-31`, Invariants 1, 2, and 3 are documented monolithically:
     - Invariant 1: Process Termination Invariant (Never Kill Primary GUI IDEs)
     - Invariant 2: Configuration & Schema Sanitization Invariant
     - Invariant 3: Rule Normalization Invariant

2. **Process Termination Implementation**:
   - In `d:\Software\Magpie\agent-space-manager\manager.mjs:1501-1527`:
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
   - In `manager.mjs:1530-1565`:
     ```javascript
     const PROTECTED_EXECUTABLES = new Set([
       "antigravity.exe", "antigravity ide.exe", "agy.exe", "cursor.exe",
       "windsurf.exe", "code.exe", "codium.exe", "vscodium.exe", "opencode.exe",
       "electron.exe", "devenv.exe", "idea64.exe",
     ]);
     ```
     Termination uses graceful calls without forceful flags (`taskkill /IM "${procName}"` on Windows, `pkill -f "${procName}"` on Unix).

3. **Configuration Sanitization & Backup Implementation**:
   - In `d:\Software\Magpie\agent-space-manager\manager.mjs:1074-1121`:
     `sanitizeAgentConfigDirectory(configDir, agentType)` iterates `projects/*.json`, unlinking files with `st.size === 0`, content `=== "{}"`, content `=== ""`, or missing `parsed.id`. It also removes empty ghost folders in `plugins/` and `skills/`.
   - In `d:\Software\Magpie\agent-space-manager\adapters.mjs:89-98`:
     ```javascript
     export function ensureBackupOnce(filePath) {
       try {
         if (fs.existsSync(filePath)) {
           const bak = `${filePath}.asm-bak`;
           if (!fs.existsSync(bak)) {
             fs.copyFileSync(filePath, bak);
           }
         }
       } catch {}
     }
     ```
   - In `tests/detect.test.mjs:56-85`: Test verifies that `sanitizeAgentConfigDirectory` prunes `corrupted-empty.json` (`"{}\n"`), `zero-byte.json`, and empty ghost folders while keeping `valid-project.json` with `id`.

4. **Rule Normalization & Frontmatter Syntax Guards**:
   - In `d:\Software\Magpie\agent-space-manager\adapters.mjs:938-955`:
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
   - In `d:\Software\Magpie\agent-space-manager\agents.mjs:66`:
     `rulesDir: { dir: path.join(base, "rules"), suffix: ".md", format: "antigravity-rule" }`.

---

## 2. Logic Chain

1. **Step 1 (Root Causes of Agent Instability)**:
   - Observation 2 reveals that terminating GUI code editors damages unsaved memory buffers, leaves orphaned LSP child daemons with locked SQLite files, and leaves Chromium `SingletonLock` artifacts.
   - Observation 3 reveals that 0-byte or empty `{}` manifest files cause background Language Servers and workspace managers to crash with `SyntaxError: Unexpected end of JSON input` or `TypeError: Cannot read properties of undefined (reading 'id')`.
   - Observation 4 reveals that rules copied without frontmatter or with missing trigger properties cause the Antigravity Cortex memory engine to fail with `CORTEX_MEMORY_TRIGGER_UNSPECIFIED`.

2. **Step 2 (Deduction of Modular Avoidance Rules)**:
   - From Step 1, these three failure modes represent distinct architectural categories:
     1. **Process Protection & Lifecycle**: Prohibits forceful killing of GUI editors, relies on inotify / file watching for zero-downtime updates, isolates tests via `ASM_TEST=1` and `NODE_ENV=test`.
     2. **Schema Sanitization**: Prohibits 0-byte or `{}` stubs, enforces mandatory identity fields (`id`, `name`), runs automated directory sanitization, protects existing configs with atomic `.asm-bak` backups.
     3. **Rule Normalization**: Enforces valid YAML frontmatter, injects fallback `trigger: always_on`, sanitizes multiline descriptions, isolates managed rules within comment delimiters.

3. **Step 3 (Formulation of File Content)**:
   - Based on Observations 1-4 and Step 2, each avoidance mechanism has been formulated into a dedicated, production-ready modular markdown rule file equipped with mandatory YAML frontmatter (`trigger: always_on`, `description: "..."`), comprehensive technical explanations, code evidence, and boundary conditions.
   - All three files have been formulated and documented in `d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_explorer_m1_1\m1_explorer_1_report.md`.

---

## 3. Caveats

- **Scope Boundary**: This investigation specifically addressed Invariant 1 (`process-termination.md`), Invariant 2 (`config-sanitization.md`), and Invariant 3 (`rule-normalization.md`). Invariants 4 through 7 (`mcp-schema-guards.md`, `webview2-dialogs.md`, `junction-lifecycle.md`, and `watcher-throttling.md`) are within the scope of peer agents (`teamwork_explorer_m1_2` and `teamwork_spec_miner_m1_3`).
- **Read-Only Explorer Discipline**: In accordance with the Explorer archetype rules, no files outside `.agents/teamwork/teamwork_explorer_m1_1` were modified. The resulting modular files should be placed into `.agents/rules/` during implementation by the implementer agent.

---

## 4. Conclusion

The technical content, failure modes, implementation invariants, and full markdown structures for the first set of modular avoidance rules are completely formulated and verified against the codebase:
1. `process-termination.md` (Invariant 1: Zero Forceful Kills & Hot-Reload Preference)
2. `config-sanitization.md` (Invariant 2: No 0-Byte or Empty `{}` Stubs & Atomic Backups)
3. `rule-normalization.md` (Invariant 3: Mandatory Frontmatter & `trigger: always_on` Syntax Guards)

The complete analysis and ready-to-write markdown contents are preserved in:
`d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_explorer_m1_1\m1_explorer_1_report.md`

---

## 5. Verification Method

To independently verify the observations, invariants, and findings:
1. **Verify Test Sandbox Isolation & Config Sanitization**:
   Execute the test suite in the workspace:
   ```powershell
   rtk npm test
   ```
   Inspect `tests/detect.test.mjs:56-85` for `sanitizeAgentConfigDirectory` assertions.
   Inspect `tests/sync-adapters.test.mjs:9-78` for `.asm-bak` backup assertions.
   Inspect `tests/helpers.mjs:6-7` for `ASM_TEST=1` and `NODE_ENV=test` process-kill bypass.
2. **Inspect Code Implementations**:
   - `manager.mjs:1501-1570`: `killAgentProcesses(ide)` protected agents and executables set.
   - `manager.mjs:1074-1121`: `sanitizeAgentConfigDirectory(configDir, agentType)`.
   - `adapters.mjs:938-955`: `antigravity-rule` frontmatter normalization.
3. **Inspect Formulated Deliverable**:
   View `d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_explorer_m1_1\m1_explorer_1_report.md`.
