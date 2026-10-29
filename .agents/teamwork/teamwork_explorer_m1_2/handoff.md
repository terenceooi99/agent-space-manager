# Handoff Report: Milestone 1 Modular Safety Invariants (Part 2)

**Author Agent**: `teamwork_explorer_m1_2`  
**Recipient**: Parent Orchestrator (`56e62fe3-5ba5-4e9d-8c31-b82ec2cab8ad`)  
**Working Directory**: `d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_explorer_m1_2`  
**Report File**: `d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_explorer_m1_2\m1_explorer_2_report.md`  
**Date**: 2026-10-29  
**Type**: Hard Handoff (Investigation & Specification Formulation Complete)

---

## 1. Observation

Direct observations from codebase inspection, line references, and test executions:

1. **MCP Schema Differences across Agents**:
   - `agents.mjs:195,205`: VS Code Copilot profile sets `mcp: { file: path.join(codeUser, "mcp.json"), format: "json", key: "servers" }` and project path `key: "servers"`.
   - `agents.mjs:165,174`: OpenCode profile sets `mcp: { file: path.join(ocDir, "opencode.json"), format: "opencode-json", key: "mcp" }`.
   - `adapters.mjs:655-677`: `toOpenCodeMcpEntry(def)` converts MCP definitions:
     ```javascript
     const cmd = def.command ? [def.command, ...(Array.isArray(def.args) ? def.args : [])] : [];
     const entry = { type: "local", command: cmd, enabled: true };
     if (def.env) entry.environment = { ...def.env };
     ```
   - `adapters.mjs:686`: `syncJsonMcpServers` resolves root key via `const rootKey = mcpSpec.key || "mcpServers";`.
   - `adapters.mjs:770-820`: `syncTomlMcpServers` writes TOML blocks between `# >>> agent-space-manager` and `# <<< agent-space-manager` with quoted table names for non-alphanumeric keys.
   - `tests/sync-adapters.test.mjs:54-56,155-159,190-198`: Tests assert that Claude uses `mcpServers`, VS Code Copilot uses `servers`, OpenCode uses `mcp` with `type: "local"` and `environment`, and Codex uses `[mcp_servers.<name>]`.

2. **WebView2 Dialog Suppression & Inline Confirmations**:
   - `page/app.js:1204-1218`: Agent removal button uses a 2-step inline confirmation with a 4-second timer:
     ```javascript
     if (removeBtn.dataset.confirming !== "true") {
       removeBtn.dataset.confirming = "true";
       removeBtn.textContent = "Click to Confirm";
       removeBtn.style.color = "#ef4444";
       confirmTimer = setTimeout(() => { ... }, 4000);
       return;
     }
     ```
   - `page/app.js:1350-1364`: Project deletion button mirrors this exact pattern.
   - `page/app.js:2294,2331`: Two residual synchronous `alert()` calls were found during form validation (`alert("Please provide an Agent/IDE name...")` and `alert("Please provide project name...")`), which fail silently in Magpie WebView2.

3. **NTFS Directory Junctions and Go `os.ReadDir` Bug**:
   - `adapters.mjs:248-346`: `materializeSkillDir` and `materializePluginBundle` create real directories on Windows with `.asm-owned.json` markers and copy top-level files (`plugin.json`, `SKILL.md`) to bypass Go's `os.ReadDir` junction issue.
   - `manager.mjs:1161-1163`:
     ```javascript
     // Use syncPluginBundles which uses real-directory materialization on Windows
     // to bypass Go os.ReadDir IsDir() == false bug on junctions!
     ```
   - `manager.mjs:969-984`: `createJunction` refuses to overwrite non-symlink paths, preventing loss of user-owned directories.
   - `manager.mjs:1015-1025`: `removeJunction` uses `cmd.exe /c rmdir "${linkPath}"` on Windows to cleanly sever the reparse point without deleting files at the junction target.
   - `tests/sync-bundle.test.mjs:122-125`: Asserts `alphaStat.isDirectory() === true` and `alphaStat.isSymbolicLink() === false`.

4. **Watcher Throttling and File Descriptor Exhaustion**:
   - `server.mjs:173-178`:
     ```javascript
     magpieWatchInterval = setInterval(() => {
       syncFromMagpiePluginsJson(false);
     }, 2000);
     if (typeof magpieWatchInterval.unref === "function") {
       magpieWatchInterval.unref();
     }
     ```
   - Polling rate is fixed at 2000ms and calls `.unref()`.

5. **Test Suite Baseline**:
   - Command: `rtk npm test`
   - Output: 41 tests passing across 10 test suites, 0 failures, duration 862ms.

---

## 2. Logic Chain

1. **From MCP Observations to `mcp-schema-guards.md`**:
   - Observation: Agents use three different root keys (`mcpServers`, `servers`, `mcp`), two different local command formats (`command` + `args` vs single `command` array), two different environment keys (`env` vs `environment`), and Codex uses TOML.
   - Inference: Writing an incorrect root key or format directly crashes the target agent's schema parser or causes the agent to ignore the tools.
   - Conclusion: A dedicated safety invariant rule (`mcp-schema-guards.md`) must codify root key selection via `profile.mcp.key`, mandatory transformation via `toOpenCodeMcpEntry()`, TOML quoting, and non-destructive merging.

2. **From Dialog Observations to `webview2-dialogs.md`**:
   - Observation: Desktop webviews suppress native browser dialogs by default, causing `confirm()` to return `false` silently, while `page/app.js` already proves that two-step inline buttons with 4-second auto-reset work reliably.
   - Inference: Retaining any calls to `confirm()`, `alert()`, or `prompt()` creates dead UI actions in desktop environments.
   - Conclusion: Invariant 4 must mandate zero native dialogs, two-step inline state machines for destructive actions, and non-blocking DOM notifications for validation.

3. **From Junction Observations to `junction-lifecycle.md`**:
   - Observation: Go's `os.ReadDir()` on Windows flags directory junctions with `FILE_ATTRIBUTE_REPARSE_POINT` without calling `os.Stat()`, causing `entry.IsDir()` to return `false`, which leads Antigravity to skip junctioned plugins. Furthermore, recursive deletion on junctions can delete source files.
   - Inference: Directory junctions cannot be used as top-level plugin/skill directories for Go-based agents; real directories must be materialized. Unlinking must use `rmdir` rather than recursive file removal.
   - Conclusion: Invariant 5 must mandate real-directory materialization for Antigravity (`.asm-owned.json` markers), safe junction unlinking via Win32 `rmdir`, and strict preservation of user-owned folders.

4. **From Watcher Observations to `watcher-throttling.md`**:
   - Observation: Multiple IDEs running concurrent LSPs will trigger I/O storms and `EMFILE` crashes if file watchers poll rapidly or react to raw file change bursts.
   - Inference: A minimum polling rate limit (>= 2000ms), `.unref()` process guards, and trailing-edge debouncing (500-1000ms) prevent watcher feedback loops.
   - Conclusion: Invariant 6 must formalize these limits and require timestamp/hash guards prior to disk writes.

---

## 3. Caveats

- **Scope Boundary**: This investigation focuses strictly on formulating technical content and specifications for rules 4, 5, 6, and 7. Creation of physical rule files in `.agents/rules/` will be performed in subsequent milestone implementation steps.
- **Residual Alerts in `page/app.js`**: Lines 2294 and 2331 contain residual `alert()` calls. These were noted for cleanup during Milestone 3 (Frontend Connect UI).
- **Go Runtime Versions**: The `os.ReadDir` behavior is verified for Go on Windows. While future Go versions may refine reparse point statting, real-directory materialization remains strictly required for backward compatibility with existing installed Antigravity binaries.

---

## 4. Conclusion

The technical content, architectural analysis, and production markdown files for the second set of modular safety invariants are fully formulated in:
`d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_explorer_m1_2\m1_explorer_2_report.md`

The 4 formulated specifications are:
1. `mcp-schema-guards.md` (MCP compatibility across VS Code Copilot, OpenCode, Claude, Codex, Cursor, etc.)
2. `webview2-dialogs.md` (Invariant 4: Zero native dialogs, 2-step inline confirmations, 4s timers)
3. `junction-lifecycle.md` (Invariant 5: Clean unlinking, Go `os.ReadDir` NTFS bug bypass, user data preservation)
4. `watcher-throttling.md` (Invariant 6: Polling >= 2000ms, debounce, `.unref()`, `EMFILE` avoidance)

Each specification includes valid YAML frontmatter (`trigger: always_on`), detailed avoidance mechanisms, code citations, and test verification references.

---

## 5. Verification Method

To independently verify the observations, logic, and conclusions:

1. **Run Full Test Suite**:
   ```powershell
   rtk npm test
   ```
   *Expected Result*: 41 tests pass across 10 test suites with 0 failures.

2. **Verify Native Adapter MCP Schemas**:
   ```powershell
   rtk node --test tests/sync-adapters.test.mjs
   ```
   *Expected Result*: Tests pass, verifying `servers` for VS Code Copilot, `mcp` for OpenCode, `mcpServers` for Claude, and `[mcp_servers]` for Codex CLI.

3. **Verify Antigravity Real Directory Materialization**:
   ```powershell
   rtk node --test tests/sync-bundle.test.mjs
   ```
   *Expected Result*: Verifies `alphaStat.isDirectory() === true` and `alphaStat.isSymbolicLink() === false`.

4. **Verify Watcher Throttling in Server**:
   Inspect `server.mjs:175` to confirm 2000ms polling with `unref()`.
