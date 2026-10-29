# Handoff Report: Survey of UI Components, Connection Flow & Preference Persistence (R1 & R2)

**Agent**: `teamwork_explorer_survey_1`  
**Date**: 2026-10-29  
**Type**: Hard Handoff (Investigation Complete)  
**Primary Deliverable**: `d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_explorer_survey_1\survey_ui_components.md`

---

## 1. Observation

Direct observations from codebase inspection and execution:

1. **"Rescan Hub" Location**:
   - `page/index.html` lines 167-171:
     ```html
     <div class="card-head">
       <h2>Components & Plugins</h2>
       <div style="display:flex; gap:8px;">
         <button type="button" class="btn-sm" id="btnToggleAllFiles" title="Expand or collapse file tree for all plugins">📁 Expand All Files</button>
         <button type="button" class="btn-sm" id="rescanBtn">Rescan Hub</button>
       </div>
     </div>
     ```
   - `page/style.css` lines 542-566 defines `.btn-sm` (padding: 4px 10px, font-size: 11.5px) and `.btn-primary` (background: #2563eb).
   - `page/app.js` lines 2358-2487 attaches the click handler to `$("rescanBtn")`.

2. **Automatic Connection Triggers**:
   - `page/app.js` lines 1647-1663: Toggling any checkbox calls `triggerAutoSync()`.
   - `page/app.js` lines 2556-2571: `triggerAutoSync()` debounces 450ms then calls `persistConfig()`.
   - `server.mjs` lines 309-322: `POST /api/save` saves config and immediately runs `syncAllIdes(config, plugins)`:
     ```javascript
     const syncRes = syncAllIdes(config, plugins);
     ```
   - `index.mjs` lines 53-60: Magpie IPC `saveConfig` saves config and immediately runs `syncAllIdes(config, plugins)`.
   - `page/app.js` lines 612-623: Startup calls `apiClient.startupSync(hubConfig)` which triggers automatic reconnection.
   - `server.mjs` lines 487-494: Server startup calls `checkAndAutoReconnectOnStartup()`.
   - `server.mjs` lines 170-179: Daemon polls every 2 seconds via `startMagpieConfigWatcher()`.

3. **Default-Enabled Mechanism**:
   - `page/app.js` line 1536:
     ```javascript
     const isEnabled = activeMap[plugin.id] !== false; // Default true
     ```
   - `page/app.js` line 1408:
     ```javascript
     const isEnabled = ide.plugins ? ide.plugins[plugin.id] !== false : true;
     ```
   - `manager.mjs` line 1151:
     ```javascript
     const isEnabled = normalized.plugins ? normalized.plugins[plugin.id] !== false : true;
     ```
   - `adapters.mjs` line 165:
     ```javascript
     const isEnabled = enabledMap ? enabledMap[plugin.id] !== false : true;
     ```
   - `manager.mjs` line 548 & `server.mjs` line 140:
     Initial default IDE contains `plugins: {}`. Any check `plugins[plugin.id] !== false` evaluates to `true`.

4. **Preference Persistence Structure**:
   - Each agent entry in `hubConfig.ides` contains a `plugins` dictionary mapping `pluginId -> boolean`.
   - Preferences are written to `hub-config.json` by `saveHubConfig()` in `manager.mjs:591-598` and synchronized to `localStorage` and `magpie.options`.
   - Across restarts, `loadHubConfig()` (`manager.mjs:530-586`) restores `ides` with each agent's custom `plugins` dictionary intact.

5. **Test Suite Baseline**:
   - Executing `rtk npm test` passes 41/41 tests across 10 suites in 654ms.

---

## 2. Logic Chain

1. **R1 Placement**: Placing `<button type="button" class="btn-sm btn-primary" id="connectBtn">Connect</button>` immediately after `<button ... id="rescanBtn">Rescan Hub</button>` within the `<div style="display:flex; gap:8px;">` container in `page/index.html` places it directly to the right of "Rescan Hub".
2. **R1 Manual Triggering**: To ensure connection is initiated *exclusively* upon clicking "Connect":
   - Toggling checkboxes must only save preferences (`persistConfig({ connect: false })` or `savePreferences()`).
   - `/api/save` and IPC `saveConfig` must be decoupled from `syncAllIdes()`.
   - A dedicated connection endpoint/action (`POST /api/connect` and `apiClient.connectTarget()`) must execute the connection for the selected target when `#connectBtn` is clicked.
   - Startup auto-reconnect must be suppressed or gated behind user action.
3. **R2 Default State**: Because `plugins: {}` is the initial state on startup or first connection to an agent, replacing `!== false` with `=== true` across `page/app.js`, `manager.mjs`, and `adapters.mjs` guarantees that all components default to unchecked/disabled (`false`) unless explicitly enabled by the user.
4. **R2 Preference Persistence**: Because `ide.plugins` is saved per-agent in `hub-config.json`, storing `ide.plugins[plugin.id] = true` when checked and restoring it on startup guarantees that user selections persist across restarts and reload correctly per agent.

---

## 3. Caveats

1. **Existing Unit Tests Impact**: In `tests/workability-status.test.mjs`, `activeIde` was tested with `plugins: {}` and expected to have a green dot under the old default-enabled assumption. Under R2, `plugins: {}` represents default-disabled (red dot). Tests will need explicit `plugins: { [pluginId]: true }` to test workable status.
2. **Project Repositories vs IDE Targets**: The UI supports both IDE targets and Project overrides (`currentSelection.type === "ide" | "project"`). The Connect button must connect whichever target is active (`ide` or `project`).
3. **Requirement R3 Bridge Replacement**: The backend adapter logic (`syncFlattenedSkills`, `syncMarkdownRulesBlock`, `syncTomlMcpServers`, `syncJsonMcpServers`, and ownership state tracking) already contains pruning logic for replaced bridges. However, when connecting a single agent, `writeHubCommunicationFiles` must be called to ensure `agent-space-bridge.json` reflects the single updated bridge without duplicates.

---

## 4. Conclusion

The technical architecture for R1 and R2 is fully mapped with exact line numbers and code references. Implementing R1 and R2 requires:
1. Adding `#connectBtn` to `page/index.html:170` styled with `.btn-sm.btn-primary`.
2. Decoupling preference saving (`/api/save`) from connection execution, and adding an explicit connection handler (`/api/connect`) tied to `#connectBtn`.
3. Inverting the default component evaluation logic from `!== false` to `=== true` across `page/app.js`, `manager.mjs`, and `adapters.mjs`.
4. Ensuring `ide.plugins` persists per agent across restarts in `hub-config.json`, `localStorage`, and `magpie.options`.

All details and code snippets are compiled in `survey_ui_components.md`.

---

## 5. Verification Method

To verify these findings and test future implementations:
1. **Inspect Target Lines**:
   - `view_file` on `page/index.html` lines 164-173.
   - `view_file` on `page/app.js` line 1536, lines 1647-1663, and lines 2358-2370.
   - `view_file` on `manager.mjs` lines 1151 and 2404.
   - `view_file` on `adapters.mjs` line 165.
2. **Execute Test Suite**:
   - Run `rtk npm test` in PowerShell from `d:\Software\Magpie\agent-space-manager`.
   - Verify baseline: 41 tests passing.
3. **Invalidation Conditions**:
   - If changing `!== false` to `=== true` without updating `tests/workability-status.test.mjs`, tests will fail with red status dot mismatch.
