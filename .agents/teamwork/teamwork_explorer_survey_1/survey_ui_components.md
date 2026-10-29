# Technical Survey: UI Components, Connection Triggers & Preference Persistence (R1 & R2)

**Workspace**: `d:\Software\Magpie\agent-space-manager`  
**Author**: `teamwork_explorer_survey_1`  
**Date**: 2026-10-29  
**Target Requirements**: R1 (Manual Connection Trigger & UI Placement) & R2 (Component Default State & Preference Persistence)

---

## 1. Executive Summary

This survey provides a comprehensive architectural and codebase analysis of the Agent Space Manager regarding Requirements R1 and R2.

### Key Discoveries:
1. **Automatic Connection Problem**: Currently, connecting to an agent is not an explicit user action; instead, it is executed automatically as a side-effect whenever any toggle checkbox changes (`triggerAutoSync()` -> `persistConfig()` -> `saveConfig()` -> `syncAllIdes()`), when IDEs are reordered or added, on background daemon polling cycles, and on startup via `checkAndAutoReconnectOnStartup()`.
2. **"Rescan Hub" Placement**: The "Rescan Hub" button (`#rescanBtn`) is situated inside a flex container `<div style="display:flex; gap:8px;">` in the card header of the "Components & Plugins" card in `page/index.html` (lines 167-170). Placing a dedicated `#connectBtn` directly to its right is seamless and conforms to existing styles (`.btn-sm.btn-primary` in `page/style.css`).
3. **Default-Enabled Root Cause**: Across both frontend and backend (`page/app.js`: 1536, 1408; `manager.mjs`: 1151, 2404; `adapters.mjs`: 165), component enablement is evaluated as `activeMap[plugin.id] !== false`. Because new IDE entries start with an empty map `plugins: {}`, any unset component evaluates to `true` (checked and linked).
4. **Preference Persistence Mechanism**: Per-agent component preferences are already structurally isolated within `ide.plugins` (a dictionary of `{ [pluginId]: boolean }` on each IDE object). What is required is:
   - Inverting the fallback logic so that only `activeMap[plugin.id] === true` is considered enabled.
   - Decoupling configuration persistence (saving toggle states to `hub-config.json`, `localStorage`, and Magpie options) from physical agent connection (creating filesystem links, bridges, and MCP/rules blocks).

---

## 2. Investigation Detail 1: UI Markup, Styles, and Controller/View Logic for "Rescan Hub"

### 2.1 UI Markup (`page/index.html`)
The "Rescan Hub" button is rendered in `page/index.html` within the right column's "Components & Plugins" card header:

```html
<!-- page/index.html: Lines 164-173 -->
<!-- Right Column: Component Matrix -->
<div class="card">
  <div class="card-head">
    <h2>Components & Plugins</h2>
    <div style="display:flex; gap:8px;">
      <button type="button" class="btn-sm" id="btnToggleAllFiles" title="Expand or collapse file tree for all plugins">📁 Expand All Files</button>
      <button type="button" class="btn-sm" id="rescanBtn">Rescan Hub</button>
    </div>
  </div>
  <p class="hint">Auto-syncs whenever any toggle is changed. Click "Files" on any row to view complete file structure.</p>
```

In addition, `page/index.html` lines 363-394 contain the `#rescanProgressModal` that displays scan stages, progress bar (`#rescanProgressBar`), and summary results cards (`#rescanCardsContainer`).

### 2.2 Styles (`page/style.css`)
- **Card Header**:
  ```css
  /* page/style.css: Lines 407-413 */
  .card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 4px;
  }
  ```
- **Button Styling**:
  ```css
  /* page/style.css: Lines 542-566 */
  .btn-sm {
    padding: 4px 10px;
    font-size: 11.5px;
    font-weight: 500;
    border-radius: 6px;
    border: 1px solid var(--magpie-border, rgba(128, 128, 128, 0.3));
    background: var(--magpie-surface, rgba(128, 128, 128, 0.08));
    color: inherit;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .btn-sm:hover {
    background: var(--magpie-border, rgba(128, 128, 128, 0.18));
  }
  .btn-primary {
    background: #2563eb;
    color: #ffffff;
    border-color: transparent;
  }
  .btn-primary:hover {
    background: #1d4ed8;
  }
  ```

### 2.3 Controller / View Logic (`page/app.js`)
The event handler for `#rescanBtn` is registered in `page/app.js` at lines 2358-2487:
1. Opens `rescanProgressModal` and resets the progress bar.
2. Purges the cached localStorage entry `magpie_plugins_${norm}`.
3. Issues `POST /api/rescan` with `{ hubRoot: effectivePath }`.
4. Calls `await persistConfig(true);` and `await reloadPluginsFromHub(true);`.
5. Re-renders the UI via `renderAll()`.
6. Populates the completion cards in `#rescanCardsContainer`.

---

## 3. Investigation Detail 2: Current Agent Selection and Connection Flow Analysis

### 3.1 When Does Connection Currently Trigger?
Currently, agent connection (meaning physical filesystem symlink/junction creation, writing native configurations like `.claude.json`, `config.toml`, and updating `agent-space-bridge.json`) occurs automatically across multiple paths:

| Trigger Source | Code Path | Description |
|---|---|---|
| **Toggle Component Checkbox** | `page/app.js:1647-1663` | Changing any checkbox updates `ide.plugins[plugin.id]` and calls `triggerAutoSync()`. |
| **Debounced Auto-Sync** | `page/app.js:2556-2571` | After 450ms, calls `persistConfig()`. |
| **Config Persistence** | `page/app.js:2573-2606` | Calls `apiClient.saveConfig(hubConfig)` and `pushOptionsToMagpie()`. |
| **REST Server `/api/save`** | `server.mjs:309-328` | Upon receiving `POST /api/save`, calls `saveHubConfig()` **and immediately calls `syncAllIdes(config, plugins)`**! |
| **Magpie Host IPC `saveConfig`** | `index.mjs:53-60` | Invoking `saveConfig` saves config **and immediately calls `syncAllIdes(config, plugins)`**! |
| **Application Startup (UI)** | `page/app.js:609-623` | Startup executes `apiClient.startupSync(hubConfig)` which triggers automatic reconnection. |
| **Application Startup (Server)** | `server.mjs:487-494` | Starting the server invokes `checkAndAutoReconnectOnStartup()`, which calls `syncAllIdes()`. |
| **Background Daemon Watcher** | `server.mjs:170-179` | `startMagpieConfigWatcher()` polls every 2 seconds, calling `syncFromMagpiePluginsJson()` which calls `syncAllIdes()`. |
| **IDE Reordering / Editing** | `page/app.js:1189, 2349` | Reordering or saving an IDE triggers `triggerAutoSync()`. |

### 3.2 Agent Selection Flow (`ideList` click)
In `page/app.js` (lines 1155-1159):
```javascript
item.addEventListener("click", (e) => {
  if (e.target.closest(".delete-ide-btn") || e.target.closest(".edit-ide-btn")) return;
  currentSelection = { type: "ide", id: ide.id };
  renderAll();
});
```
- Clicking an IDE in the left column simply updates the in-memory variable `currentSelection` and re-renders the views (`renderAll()`).
- It does **not** itself trigger synchronization, but because all components were default-enabled, selecting an agent showed all components checked.

---

## 4. Investigation Detail 3: UI Accommodation for the "Connect" Button

### 4.1 HTML Placement
In `page/index.html` (lines 167-171), the button group container should be updated to place the Connect button directly to the right of `#rescanBtn`:

```html
<div class="card-head">
  <h2>Components & Plugins</h2>
  <div style="display:flex; gap:8px;">
    <button type="button" class="btn-sm" id="btnToggleAllFiles" title="Expand or collapse file tree for all plugins">📁 Expand All Files</button>
    <button type="button" class="btn-sm" id="rescanBtn">Rescan Hub</button>
    <button type="button" class="btn-sm btn-primary" id="connectBtn" title="Manually connect and synchronize enabled components to target agent">⚡ Connect</button>
  </div>
</div>
```

### 4.2 Updating the Guidance Hint
Line 172 of `page/index.html` currently states:
`<p class="hint">Auto-syncs whenever any toggle is changed. Click "Files" on any row to view complete file structure.</p>`

To reflect Requirement R1, update this hint to:
`<p class="hint">Toggle components to configure preferences. Click "Connect" to link and synchronize components with the active target agent.</p>`

### 4.3 Visual Feedback and Interactive States
The Connect button should provide clear visual feedback:
1. **Idle State**: `<button type="button" class="btn-sm btn-primary" id="connectBtn">⚡ Connect</button>`
2. **Connecting State**:
   - `connectBtn.disabled = true;`
   - `connectBtn.textContent = "Connecting...";`
   - Top status indicator (`#syncIndicator`): changes to `"Connecting..."` with `.syncing` class.
3. **Success State**:
   - `connectBtn.textContent = "✓ Connected";`
   - `connectBtn.classList.add("btn-success");`
   - After 2000ms, resets back to `"⚡ Connect"`.
   - The active IDE row's subtitle in the left column updates with the sync summary (e.g. `"Synced: 3 skills · 1 MCP"`).

---

## 5. Investigation Detail 4: Selectable Components Lifecycle (Loading, Initialization, Rendering)

### 5.1 Discovery and Loading
- Plugins and components are discovered from the active storage directory (`hubConfig.hubRoot` or `resolveHubRoot()`).
- `manager.mjs` (`scanPlugins(effPath)`) discovers plugins, MCP servers, skills, rules, agents, and hooks.
- Discovery results are cached across 4 layers:
  1. Memory: `discoveredPlugins` and `discoveredCategories`.
  2. Same-origin cache: `page/plugins-cache.json` and `page/plugins-cache.js` (`window.__PLUGINS_CACHE__`).
  3. `localStorage`: `"magpie_plugins_" + norm`.
  4. Backend REST API `/api/plugins` and Magpie IPC `getPlugins`.

### 5.2 Component Table Rendering (`renderPluginTable`)
In `page/app.js` (lines 1491-1667):
1. Determines the active selection:
   ```javascript
   if (currentSelection.type === "ide") {
     const ide = hubConfig.ides.find((i) => i.id === currentSelection.id);
     targetTitle = ide?.name || "Global Platform";
     activeMap = ide?.plugins || {};
   } else if (currentSelection.type === "project") {
     const proj = hubConfig.projects.find((p) => p.id === currentSelection.id);
     targetTitle = proj?.name || "Project Override";
     activeMap = proj?.plugins || {};
   }
   ```
2. Iterates over each discovered plugin:
   - Checks enabled state: currently `const isEnabled = activeMap[plugin.id] !== false; // Default true`.
   - Renders row with toggle switch: `<input type="checkbox" class="plugin-toggle" data-plugin="${plugin.id}" ${isEnabled ? "checked" : ""}>`.
   - Evaluates workability status dot via `evaluateComponentWorkability(plugin)`.
   - Toggling the switch updates `activeMap[plugin.id] = e.target.checked`.

---

## 6. Investigation Detail 5: Root Cause of Default-Enabled State & Migration to Default-Disabled

### 6.1 Root Cause Analysis
The system was explicitly authored to treat missing keys in `plugins` as `true`. Every layer contains the pattern:

```javascript
// page/app.js: Line 1536 (UI Table)
const isEnabled = activeMap[plugin.id] !== false; // Default true

// page/app.js: Line 1408 (UI Workability Evaluation)
const isEnabled = ide.plugins ? ide.plugins[plugin.id] !== false : true;

// page/app.js: Line 1454 (UI Project Workability Evaluation)
const isEnabled = project.plugins ? project.plugins[plugin.id] !== false : (parentIde?.plugins ? parentIde.plugins[plugin.id] !== false : true);

// manager.mjs: Line 1151 (Bundle Sync)
const isEnabled = normalized.plugins ? normalized.plugins[plugin.id] !== false : true;

// manager.mjs: Line 2404 (Backend Workability Evaluation)
const isEnabled = ide.plugins ? ide.plugins[plugin.id] !== false : true;

// adapters.mjs: Line 165 (collectEnabledComponents)
const isEnabled = enabledMap ? enabledMap[plugin.id] !== false : true;
```

When a user opens the application for the first time or adds a new agent, the IDE's plugins dictionary is `{}`:
```javascript
// page/app.js: Line 586-598 & manager.mjs: Line 548
plugins: {}
```
Because `{}` has no key for any plugin, `activeMap[plugin.id]` is `undefined`.  
Since `undefined !== false` evaluates to **`true`**, every component defaulted to enabled.

### 6.2 Proposed Fix to Enforce Requirement R2
Requirement R2 dictates:
*"On initial application startup or when connecting to an agent for the first time, all components must default to unchecked / disabled. Persist and restore user component selections for each connected agent across restarts and subsequent sessions."*

To implement this invariant:
1. **Frontend (`page/app.js`)**:
   - Line 1536: Change to:
     ```javascript
     const isEnabled = Boolean(activeMap && activeMap[plugin.id] === true);
     ```
   - Line 1408: Change to:
     ```javascript
     const isEnabled = Boolean(ide.plugins && ide.plugins[plugin.id] === true);
     ```
   - Line 1454: Change to:
     ```javascript
     const isEnabled = project.plugins && project.plugins[plugin.id] !== undefined
       ? project.plugins[plugin.id] === true
       : Boolean(parentIde?.plugins && parentIde.plugins[plugin.id] === true);
     ```

2. **Backend Engine (`manager.mjs` & `adapters.mjs`)**:
   - `manager.mjs` line 1151: Change to:
     ```javascript
     const isEnabled = Boolean(normalized.plugins && normalized.plugins[plugin.id] === true);
     ```
   - `manager.mjs` line 2404: Change to:
     ```javascript
     const isEnabled = Boolean(ide.plugins && ide.plugins[plugin.id] === true);
     ```
   - `adapters.mjs` line 165: Change to:
     ```javascript
     const isEnabled = Boolean(enabledMap && enabledMap[plugin.id] === true);
     ```

3. **Impact on Existing Tests**:
   - In `tests/workability-status.test.mjs`, `activeIde` was initialized with `plugins: {}` and expected to be green. Under R2, with `plugins: {}`, all components default to disabled (red dot). To test workable status with green dot, the test must explicitly enable the sample plugin: `plugins: { [samplePlugin.id]: true }`.
   - In `tests/sync-adapters.test.mjs` and `tests/sync-bundle.test.mjs`, tests that test linking behavior with `plugins: {}` will now expect 0 components to be linked unless explicitly enabled in `plugins`. The test suite will be updated accordingly in R4.

---

## 7. Investigation Detail 6: Per-Agent Preference Persistence Across Restarts

### 7.1 Architecture of Preference Storage
Component selections are persisted in a multi-tiered architecture:

```
[UI Checkbox Change]
       │
       ▼
[Update in-memory: ide.plugins[pluginId] = boolean]
       │
       ▼
[persistConfig()] ───> 1. localStorage.setItem("magpie_agent_space_config", ...)
       │
       ├──────────────> 2. apiClient.saveConfig(hubConfig) ──> POST /api/save ──> saveHubConfig() ──> hub-config.json
       │
       └──────────────> 3. magpie.options.set({ hubConfig })
```

### 7.2 Persistence Verification
- Each connected agent in `hubConfig.ides` has an independent `plugins` dictionary keyed by plugin ID:
  ```json
  {
    "id": "antigravity",
    "name": "Antigravity (Google Gemini)",
    "plugins": {
      "alpha-plugin": true,
      "beta-plugin": false
    }
  },
  {
    "id": "claude-code",
    "name": "Claude Code",
    "plugins": {
      "security-audit": true
    }
  }
  ```
- **Across Restarts**:
  1. On reload, `hubConfig` is loaded from `hub-config.json` (or `localStorage` / `magpie.options`).
  2. Each agent retains its specific `plugins` mappings.
  3. Clicking on an agent restores that agent's exact checkbox selections in `renderPluginTable()`.
  4. Plugins not present in `ide.plugins` default to unchecked (`false`).

### 7.3 Decoupling Preference Saving from Connection Execution
To strictly fulfill Requirement R1 (connecting happens exclusively on clicking "Connect"):
1. When a user toggles a checkbox:
   - Call `triggerSavePreferences()` instead of `triggerAutoSync()`.
   - Save the preferences via `saveConfig({ sync: false })` or `persistConfig(false, { noConnect: true })`.
   - In `server.mjs` (`/api/save`) and `index.mjs` (`saveConfig`): Save the file to `hub-config.json`, update `plugins-cache.json`, but **do NOT invoke `syncAllIdes()`**.
2. When the user clicks the "Connect" button:
   - Call `apiClient.connectTarget(currentSelection.id, currentSelection.type)` (or `POST /api/connect`).
   - Execute `syncIdePlugins` (or `syncProjectOverrides`) for the target.
   - Update `agent-space-bridge.json` and `agent-connectors.json`.
   - Return sync results and update UI status indicators.

---

## 8. Summary of File Paths and Lines for Implementation

| File | Lines | Purpose |
|---|---|---|
| `page/index.html` | 167-172 | Add `<button id="connectBtn">` beside `#rescanBtn` and update hint text. |
| `page/style.css` | 558-566 | Ensure `.btn-primary` and `.btn-success` interactive states for `#connectBtn`. |
| `page/app.js` | 1536 | Change default enabled from `!== false` to `=== true`. |
| `page/app.js` | 1408, 1454 | Change workability dot calculation to default disabled. |
| `page/app.js` | 1647-1663 | Make checkbox toggle save preferences without triggering physical connection. |
| `page/app.js` | 2358+ | Add event listener for `#connectBtn` to execute explicit manual connection. |
| `manager.mjs` | 1151, 2404 | Change backend default enabled check to `=== true`. |
| `adapters.mjs` | 165 | Change `collectEnabledComponents` default enabled check to `=== true`. |
| `server.mjs` | 309-328 | Add `POST /api/connect` endpoint and prevent `/api/save` from auto-syncing. |
| `index.mjs` | 53-60 | Decouple `saveConfig` from `syncAllIdes` and expose `connectTarget` IPC method. |
