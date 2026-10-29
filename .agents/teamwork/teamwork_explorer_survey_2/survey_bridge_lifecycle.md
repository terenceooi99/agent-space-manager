# Technical Survey: Single Connection Bridge Replacement Lifecycle (Requirement R3)

**Author:** `teamwork_explorer_survey_2`  
**Date:** 2026-10-29  
**Target:** Requirement R3 (Single Connection Bridge Replacement upon repeated connections to the same agent)  
**Codebase:** `d:\Software\Magpie\agent-space-manager`  

---

## 1. Executive Summary

Requirement R3 mandates:
> **Single Connection Bridge Replacement:** When a user manually connects to the same connected agent multiple times with different sets of components, replace the existing connection bridge rather than creating duplicate bridges, preventing connection bloat on the target agent.

Currently, Agent Space Manager supports 13 AI Agent IDE profiles across bundle mode (Antigravity) and native convert mode (Claude Code, Codex, OpenCode, Copilot, Cursor, Windsurf, etc.). However, when an agent is added or reconnected via the UI or API:
1. `page/app.js` (lines 2310–2312) generates timestamped IDs (`${baseId}-${Date.now()}`) and appends duplicate entries into `hubConfig.ides`.
2. Each duplicate entry creates a distinct ownership state (`ide-${baseId}-${Date.now()}.json`), splitting the ownership tracking for the same physical agent configuration directory.
3. During sync, both entries independently write to the same target files/directories, causing conflicting junctions, orphaned links, duplicated entries in `agent-space-bridge.json` and `shared/agent-connectors.json`, and duplicate handoff inbox folders on disk (`shared/handoff/<id>`).
4. There is no dedicated manual `Connect` button or dedicated `replaceAgentBridge` / `connectAgent` backend pipeline that performs an atomic in-place bridge replacement.

This survey details the architecture, traces the root causes of bridge duplication, establishes the exact replacement lifecycle adhering to `agent-safety-invariants.md`, and specifies the exact code modifications required.

---

## 2. Backend Architecture for Agent Connection

The connection bridge between Agent Space Manager and target agent IDEs is orchestrated across four layers:

```
┌────────────────────────────────────────────────────────────────────────┐
│ UI Layer: page/app.js & page/index.html                                │
│ [Connect Button] ──> apiClient.connectAgent(ide, plugins)              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / Magpie Host IPC
┌───────────────────────────────────▼────────────────────────────────────┐
│ Server & IPC Layer: server.mjs & index.mjs                             │
│ /api/connect, /api/save, /api/rescan, background daemon watcher        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Bridge & Manager Engine: manager.mjs                                   │
│ syncIdePlugins(), unlinkAllForIde(), sanitizeAgentConfigDirectory(),   │
│ createJunction(), removeJunction(), killAgentProcesses()               │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
┌───────────────────────────────────▼────────────────────────────────────┐
│ Native Adapters & Manifest Store: adapters.mjs & agents.mjs            │
│ - AGENT_PROFILES (13 profiles, bundle vs convert)                      │
│ - Materialization: syncPluginBundles(), syncFlattenedSkills()          │
│ - Config Injections: syncJsonMcpServers(), syncTomlMcpServers()        │
│ - Rules & Agents: syncMarkdownRulesBlock(), syncOwnedFiles()           │
│ - Communication Files: writeHubCommunicationFiles()                    │
│ - Ownership State: ~/.agent-space-manager/state/ide-<id>.json          │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Adapter System (`adapters.mjs`, `agents.mjs`)
- **Profile Registry (`agents.mjs:51–442`)**: Defines 13 profiles (`antigravity`, `claude-code`, `codex`, `opencode`, `cursor`, `windsurf`, `vscode-copilot`, `gemini-cli`, `cline`, `roo-code`, `kiro`, `agents-universal`, `custom`).
- **Connection Modes**:
  1. **Mode `"bundle"` (`antigravity`)**:
     - Links full plugin bundles into `~/.gemini/config/plugins/<pluginId>` using Windows directory materialization (`materializePluginBundle`, `adapters.mjs:290–346`) with `.asm-owned.json` ownership markers.
     - Flattened skills are linked to `~/.gemini/config/skills/<skill-name>` (`syncFlattenedSkills`, `adapters.mjs:436–545`) so `/` slash commands work.
     - Rules are copied to `~/.gemini/config/rules/<rule>.md` with normalized YAML frontmatter (`trigger: always_on`), and subagents to `~/.gemini/config/agents/<agent>.md` (`adapters.mjs:883–970`).
     - Stale hub entries are cleaned from `~/.gemini/config/skills.json` while strictly preserving user-created entries (`manager.mjs:1257–1268`).
  2. **Mode `"convert"` (Claude Code, Codex, OpenCode, Cursor, Windsurf, etc.)**:
     - Extracts skills directly into native target dirs (`~/.claude/skills/<s>/SKILL.md`, `~/.config/opencode/skills/<s>/SKILL.md`, `~/.cursor/skills/<s>/SKILL.md`).
     - Generates native `/` quick-action slash commands (`syncSkillSlashCommands`, `adapters.mjs:552–648`) in `~/.claude/commands/`, `~/.config/opencode/commands/`, `~/.codeium/windsurf/global_workflows/`, or `Code/User/prompts/`.
     - Merges MCP servers into native JSON (`~/.claude.json`, `~/.cursor/mcp.json`, `opencode.json` via `toOpenCodeMcpEntry`) or TOML blocks (`~/.codex/config.toml` via `syncTomlMcpServers`).
     - Injects managed rules into `CLAUDE.md`, `AGENTS.md`, or copies rules files to `rulesDir`.
     - Injects `@` mention subagents into native agent folders.

### 2.2 Bridge Managers & Lifecycle Control (`manager.mjs`)
- **`syncIdePlugins(ide, allPlugins)` (`manager.mjs:1123–1405`)**:
  - Resolves target paths via `resolveEffectiveAgentPaths(normalized)`.
  - Runs `sanitizeAgentConfigDirectory(primaryDir, agentType)`.
  - Loads ownership state for `ownerKey = 'ide-' + (normalized.id || agentType)`.
  - Diffs requested components against `prevState`. Prunes unselected items, links selected ones.
  - Saves updated ownership state via `saveOwnershipState(ownerKey, newState)`.
- **`unlinkAllForIde(ide, killProcesses)` (`manager.mjs:1574–1585`)**:
  - Passes empty `allPlugins = []` into `syncIdePlugins(normalized, [])`, which triggers full unlinking of all owned links, files, MCP keys, and rule blocks.
  - Deletes ownership state file via `deleteOwnershipState(ownerKey)`.
  - Calls `killAgentProcesses(normalized)` (which hot-reload protects all GUI IDEs).
- **`syncAllIdes(hubConfig, customPlugins)` (`manager.mjs:1619–1690`)**:
  - Reconciles active vs deleted owner IDs. Any stale ownership state whose owner ID is no longer in `hubConfig.ides` has all links and files pruned.
  - Iterates over all active IDEs and runs `syncIdePlugins`.
  - Calls `writeHubCommunicationFiles(...)` to regenerate the hub bridge files.

### 2.3 Bridge Registry & Communication Files (`adapters.mjs:1058–1225`)
Every sync run updates two communication files in `<hubRoot>`:
1. **`<hubRoot>/agent-space-bridge.json`**:
   - `activeAgents`: Array of connected agent descriptors (`id`, `name`, `agentType`, `exePath`, `configPath`, `componentPaths`, `effectivePaths`, `status: "connected"`).
   - Component counts: `plugins`, `skills`, `mcpServers`, `rules`, `agents`, `hooks`.
2. **`<hubRoot>/shared/agent-connectors.json`**:
   - `connectors`: Map of `connectors[agent.id]`.
   - Provides runtime discovery: CLI commands, skills directory, MCP config file, rules file, and `handoffInbox`.
3. **`<hubRoot>/shared/handoff/<agent.id>/`**:
   - Dedicated cross-agent messaging and handoff directory created for each connected agent ID.

### 2.4 Safe Junction & Symlink Creation (`manager.mjs:958–1039`)
- `createJunction(sourcePath, linkPath)`: Creates Windows directory junctions (`cmd.exe /c mklink /J`) or Unix symlinks (`fs.symlinkSync`).
- **Safety invariant**: If a real, user-owned directory or file already exists at `linkPath` without being a link or marked with `.asm-owned.json`, it **refuses** to overwrite or delete it, preventing data loss.
- `removeJunction(linkPath)`: Safely removes links via `cmd.exe /c rmdir` or `fs.unlinkSync` without deleting target content.

### 2.5 Daemon Sidecars & Configuration Watchers (`server.mjs`)
- `startApiServer(port = 41789)` (`server.mjs:201–498`): Serves REST endpoints for config, plugins, sync, and file browsing.
- `ensureBackgroundDaemon()` (`server.mjs:181–199`): Ensures a headless background daemon process is alive.
- `startMagpieConfigWatcher()` (`server.mjs:170–179`): Polls `~/.config/magpie/plugins.json` every 2000ms with debounce, ensuring hot-sync with the Magpie host.

---

## 3. Storage, Keying, and Tracking of Active Bridges

Active bridges are tracked across five distinct locations:

| Storage Location | File / Path | Keying Scheme | Contents |
|---|---|---|---|
| **Configuration Manifest** | `<hubRoot>/hub-config.json` | `config.ides[n].id` | Agent list, enabled flags, selected plugins map (`plugins: { [id]: boolean }`), custom componentPaths. |
| **Client Storage Fallback** | `localStorage["magpie_agent_space_config"]` | `hubConfig.ides[n].id` | Cached UI copy of `hub-config.json`. |
| **Magpie Host Options** | `~/.config/magpie/plugins.json` | `options.hubConfig.ides` | Persisted plugin options within Magpie host. |
| **Ownership Manifests** | `~/.agent-space-manager/state/<ownerKey>.json` | `ownerKey = "ide-" + (ide.id \|\| agentType)` | Exact tracking of all ASM-created links, files, JSON keys, and blocks: `{ links: [], files: [], jsonKeys: {}, blocks: [] }`. |
| **Hub Bridge Manifest** | `<hubRoot>/agent-space-bridge.json` | `activeAgents[n].id` | Runtime status, effective paths, component counts for all active agents. |
| **Cross-Agent Connectors** | `<hubRoot>/shared/agent-connectors.json` | `connectors[agent.id]` | Discovery registry and inbox pointers. |
| **Handoff Inboxes** | `<hubRoot>/shared/handoff/<agent.id>/` | Directory named `<agent.id>` | Handoff dropboxes on disk. |

---

## 4. Root Cause Analysis: Why Duplicate Bridges and Bloat Occur

When a user repeatedly connects to or configures the same agent with different components, the current implementation spawns duplicate bridges and bloated connections due to four compounding mechanisms:

### Root Cause 1: Timestamped ID Generation on Add/Save (`page/app.js:2310–2312`)
In `page/app.js`:
```javascript
// page/app.js:2310-2312
const baseId = (agentType !== "custom" ? agentType : name).toLowerCase().replace(/[^a-z0-9]/g, "-");
const id = hubConfig.ides.some((i) => i.id === baseId) ? `${baseId}-${Date.now()}` : baseId;
hubConfig.ides.push({ id, name, agentType, exePath, configPath, componentPaths, enabled: true, plugins: {} });
```
When a user adds or connects an agent that already exists in `hubConfig.ides`:
1. `hubConfig.ides.some((i) => i.id === baseId)` evaluates to `true`.
2. Instead of replacing the existing agent entry, a new ID is generated: `${baseId}-${Date.now()}` (e.g. `antigravity-1730188045123` or `claude-code-1730188045123`).
3. The new entry is appended to `hubConfig.ides`.
4. Now `hubConfig.ides` contains two entries pointing to the exact same agent.

### Root Cause 2: Ownership State Splitting & Collision
Because the new entry has a new ID:
- The first bridge is tracked under `ide-antigravity.json`.
- The new duplicate bridge is tracked under `ide-antigravity-1730188045123.json`.
- When `syncIdePlugins` executes for the duplicate entry, `loadOwnershipState("ide-antigravity-1730188045123")` loads an **empty** state (`links: []`, `files: []`, `jsonKeys: {}`).
- The duplicate sync is **blind** to the items created by the first bridge!
- It does not prune components unselected in the second set; instead, it writes directly over the same target directories.
- If Bridge 1 had Component A enabled and Component B disabled, and Bridge 2 has Component B enabled and Component A disabled:
  - Bridge 2 creates links for Component B.
  - Bridge 1's junctions for Component A remain unpruned in the filesystem because Bridge 2 has no record of them in its ownership state!
  - Result: The target agent config accumulates an unmanaged union of components (connection bloat).

### Root Cause 3: Communication Bridge & Connector Multiplication
`writeHubCommunicationFiles` (`adapters.mjs:1069–1083`) iterates over `hubConfig.ides`:
```javascript
const activeAgents = ides.filter((i) => i.enabled !== false).map(...)
```
Each duplicate IDE entry produces:
1. An additional entry in `agent-space-bridge.json:activeAgents`.
2. An additional connector in `shared/agent-connectors.json:connectors`.
3. An additional directory in `shared/handoff/<agent.id>-<timestamp>/`.
4. Additional duplicate cards in the Rescan & Linking modal in the UI.

### Root Cause 4: Automatic Debounced Sync Instead of Explicit Manual Connect
Currently, `page/app.js` runs `triggerAutoSync()` immediately on every checkbox change:
```javascript
// page/app.js:1662
row.querySelector(".plugin-toggle").addEventListener("change", (e) => {
  ...
  triggerAutoSync(); // Calls persistConfig() -> syncAllIdes() on every toggle!
});
```
Furthermore:
- There is NO `Connect` button in `page/index.html` (only `Rescan Hub`).
- All selectable components default to `true` (`isEnabled = activeMap[plugin.id] !== false`), violating R2.
- Changing selections immediately initiates multi-agent synchronization, preventing the user from staging component selections for a specific agent and executing a single, controlled bridge replacement.

---

## 5. Clean Bridge Teardown and Replacement Lifecycle (Adhering to Safety Invariants)

To cleanly replace an existing connection bridge when a user connects with a modified component set, the replacement must follow this strict 7-phase lifecycle:

```
[Phase 1: Agent Identification & Match Resolution]
   │ - Match incoming agent against hubConfig.ides by (id == targetId) OR
   │   (agentType == targetType AND normalize(configPath) == normalize(targetConfigPath))
   │ - Identify canonical agentId; collect any duplicate entries
   ▼
[Phase 2: Ownership State Aggregation]
   │ - Load canonical state: ide-<targetId>.json
   │ - If duplicate IDs existed (e.g. ide-<targetId>-<timestamp>.json), load and merge
   │   their links, files, jsonKeys, and blocks into an aggregated prevState
   ▼
[Phase 3: Pre-Sync Sanitization]
   │ - Run sanitizeAgentConfigDirectory(primaryDir, agentType)
   │ - Prune any 0-byte or empty {} project manifests in projects/
   │ - Prune empty ghost directories in plugins/ and skills/
   ▼
[Phase 4: Differential Component Teardown & Reconstruction (syncIdePlugins)]
   │ - For removed links: removeJunction() -> verify link severed
   │ - For removed files: fs.unlinkSync() (rules, subagents, commands)
   │ - For removed MCP keys: delete container[oldKey] in mcp.json/opencode.json
   │ - For removed TOML/Markdown blocks: strip demarcated comment blocks
   │ - For new components: materialize bundle/skills with .asm-owned.json
   │ - For new rules: write markdown with YAML frontmatter (trigger: always_on)
   │ - For user configs modified: ensure .asm-bak backup created first
   │ - Atomic write of updated configs
   ▼
[Phase 5: Single Ownership State Persistence]
   │ - Save consolidated ownership state to ide-<targetId>.json
   │ - Delete any obsolete duplicate state files (ide-<targetId>-<timestamp>.json)
   ▼
[Phase 6: Single Hub Config & Communication File Consolidation]
   │ - In hubConfig.ides: retain ONLY the canonical agent entry with updated plugins map
   │ - Prune all duplicate entries from hubConfig.ides and save hub-config.json
   │ - Regenerate agent-space-bridge.json (single entry in activeAgents)
   │ - Regenerate shared/agent-connectors.json (single entry in connectors)
   │ - Prune obsolete handoff folders (shared/handoff/<staleId>/)
   ▼
[Phase 7: Safety Invariants Verification]
     - Verify ZERO GUI IDE processes were targeted by process termination
     - Verify no 0-byte or {} stub files remain
     - Verify all synchronized rules contain valid frontmatter
     - Verify non-blocking UI confirmations (no window.alert / window.confirm)
```

### Safety Invariants Checklist for Bridge Replacement:
1. **Never Kill Primary GUI IDEs (`agent-safety-invariants.md:§1`)**:
   - `killAgentProcesses` must strictly preserve `antigravity.exe`, `cursor.exe`, `windsurf.exe`, `code.exe`, `opencode.exe`. Modern IDEs hot-reload rules, skills, and MCPs on disk. Process killing is prohibited for editor GUIs.
2. **Schema & Config Sanitization Invariant (`agent-safety-invariants.md:§2`)**:
   - `sanitizeAgentConfigDirectory()` must be called before and after bridge replacement. Never create 0-byte JSON files or `{}` files without required identifiers (`"id"`). Atomic writes with `.asm-bak` backups are mandatory.
3. **Rule Normalization Invariant (`agent-safety-invariants.md:§3`)**:
   - All rules copied to `~/.gemini/config/rules/` must include YAML frontmatter with `trigger: always_on` to prevent Cortex parser failures.
4. **Desktop WebView2 UI Interaction Invariant (`agent-safety-invariants.md:§4`)**:
   - All native `window.alert()` and `window.confirm()` calls in `page/app.js` must be replaced with inline status messages or modals.
5. **Junction & Link Lifecycle Invariant (`agent-safety-invariants.md:§5`)**:
   - Dangling junctions and empty ghost directories must be cleanly removed (`fs.rmSync(dir, { recursive: true, force: true })`). Real user files not owned by ASM must never be touched.

---

## 6. Required Modifications: Files, Functions, and Interfaces

### 6.1 `manager.mjs`

#### New Function: `connectAgent(hubConfig, targetIde, options = {})`
```javascript
/**
 * Connects or reconnects an agent IDE, replacing any existing bridge for that agent
 * rather than creating duplicate bridges. Guarantees clean differential teardown,
 * ownership consolidation, and safety invariant compliance.
 *
 * @param {object} hubConfig - The current hub configuration object.
 * @param {object} targetIde - The IDE entry to connect (with updated plugins map).
 * @param {object} [options] - Additional connection options (customPlugins, effHub).
 * @returns {object} { success: boolean, ide: object, sync: object, hubConfig: object }
 */
export function connectAgent(hubConfig, targetIde, options = {}) {
  if (!hubConfig || !targetIde) return { success: false, error: "Missing config or IDE" };

  const effHub = options.effHub || getEffectiveHubRoot(hubConfig);
  const plugins = options.customPlugins || scanPlugins(effHub);

  // 1. Identify existing bridge for this agent (by id, or agentType + normalized configPath)
  const normTarget = normalizeIdeEntry(targetIde);
  const targetType = normTarget.agentType;
  const targetConfig = path.resolve(expandHomePath(normTarget.configPath || ""));

  let existingIndex = (hubConfig.ides || []).findIndex((i) => i.id === normTarget.id);
  if (existingIndex === -1 && targetConfig) {
    existingIndex = (hubConfig.ides || []).findIndex((i) => {
      const iConfig = path.resolve(expandHomePath(i.configPath || ""));
      return i.agentType === targetType && iConfig === targetConfig;
    });
  }

  const canonicalId = existingIndex !== -1 ? hubConfig.ides[existingIndex].id : normTarget.id;
  normTarget.id = canonicalId;

  // 2. Aggregate previous ownership states from canonical ID and any duplicate timestamped IDs
  const canonicalOwnerKey = `ide-${canonicalId}`;
  const aggregatedPrevState = loadOwnershipState(canonicalOwnerKey);

  // Find any obsolete duplicate entries in hubConfig matching this agent
  const duplicatesToRemove = [];
  hubConfig.ides = (hubConfig.ides || []).filter((i, idx) => {
    if (idx === existingIndex) return true;
    const isSameId = i.id === canonicalId;
    const isSameTarget = i.agentType === targetType &&
      path.resolve(expandHomePath(i.configPath || "")) === targetConfig;
    if (isSameId || isSameTarget) {
      duplicatesToRemove.push(i);
      return false;
    }
    return true;
  });

  // Merge ownership states of duplicate entries so their links/files are cleanly unlinked
  for (const dup of duplicatesToRemove) {
    const dupKey = `ide-${dup.id || dup.agentType}`;
    const dupState = loadOwnershipState(dupKey);
    aggregatedPrevState.links.push(...(dupState.links || []));
    aggregatedPrevState.files.push(...(dupState.files || []));
    Object.assign(aggregatedPrevState.jsonKeys, dupState.jsonKeys || {});
    aggregatedPrevState.blocks.push(...(dupState.blocks || []));
    deleteOwnershipState(dupKey);
  }
  saveOwnershipState(canonicalOwnerKey, aggregatedPrevState);

  // 3. Update or insert the single agent entry in hubConfig.ides
  if (existingIndex !== -1) {
    hubConfig.ides[existingIndex] = {
      ...hubConfig.ides[existingIndex],
      ...normTarget,
      enabled: true,
      plugins: normTarget.plugins || {},
    };
  } else {
    hubConfig.ides.push({ ...normTarget, enabled: true, plugins: normTarget.plugins || {} });
  }

  // 4. Differential Sync: syncIdePlugins tears down unselected components & creates new ones
  const syncResult = syncIdePlugins(normTarget, plugins);

  // 5. Update hub-config.json and communication files (agent-space-bridge.json, agent-connectors.json)
  saveHubConfig(hubConfig);
  try {
    writeHubCommunicationFiles(effHub, hubConfig, plugins, { ides: [syncResult] });
  } catch {}

  // 6. Clean dangling handoff folders for removed duplicate IDs
  for (const dup of duplicatesToRemove) {
    if (dup.id && dup.id !== canonicalId) {
      const staleHandoff = path.join(effHub, "shared", "handoff", dup.id);
      try {
        if (fs.existsSync(staleHandoff)) {
          fs.rmSync(staleHandoff, { recursive: true, force: true });
        }
      } catch {}
    }
  }

  return {
    success: syncResult.success !== false,
    ide: normTarget,
    sync: syncResult,
    hubConfig,
  };
}
```

#### Update `manager.mjs` Exports (`manager.mjs:45–55`)
Add `connectAgent` to the exported functions list.

---

### 6.2 `server.mjs`

#### New Endpoint: `POST /api/connect`
Add route to `startApiServer` (`server.mjs:290–330`):
```javascript
if (pathname === "/api/connect" && req.method === "POST") {
  let body = "";
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => {
    try {
      const { ide, plugins: customPlugins } = JSON.parse(body || "{}");
      if (!ide) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "ide required" }));
        return;
      }
      const config = loadHubConfig();
      const result = connectAgent(config, ide, { customPlugins });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
    } catch (err) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
  });
  return;
}
```

#### Deduplication in `saveHubConfig` and `/api/save`
Ensure `/api/save` and `saveHubConfig` deduplicate `config.ides` by matching `(agentType, configPath)` so duplicate bridges can never be accidentally introduced.

---

### 6.3 `index.mjs`

#### Extend `AgentSpaceManagerPlugin.api` (`index.mjs:46–152`)
```javascript
connectAgent: async (targetIde, customPlugins = null) => {
  const cfg = loadHubConfig();
  return connectAgent(cfg, targetIde, { customPlugins });
},
```

---

### 6.4 `page/index.html`

#### Place Connect Button Beside "Rescan Hub" (`page/index.html:167–171`)
Replace:
```html
<div style="display:flex; gap:8px;">
  <button type="button" class="btn-sm" id="btnToggleAllFiles" title="Expand or collapse file tree for all plugins">📁 Expand All Files</button>
  <button type="button" class="btn-sm" id="rescanBtn">Rescan Hub</button>
</div>
```
With:
```html
<div style="display:flex; gap:8px; align-items:center;">
  <button type="button" class="btn-sm" id="btnToggleAllFiles" title="Expand or collapse file tree for all plugins">📁 Expand All Files</button>
  <button type="button" class="btn-sm" id="rescanBtn">Rescan Hub</button>
  <button type="button" class="btn-sm btn-primary" id="connectBtn" title="Connect or Re-connect the selected agent with active components">Connect</button>
</div>
```

---

### 6.5 `page/app.js`

1. **Connect Button Handler**:
   - On `#connectBtn` click:
     - Check `currentSelection`. If `currentSelection.type !== "ide"`, show non-blocking banner: `"Select an Agent on the left to connect."`
     - Obtain the selected `ide = hubConfig.ides.find(i => i.id === currentSelection.id)`.
     - Update button state: `"Connecting..."` with disabled state.
     - Call `apiClient.connectAgent(ide)` (via `POST /api/connect` or Magpie IPC).
     - Upon completion, update button to `"Connected ✓"` for 2 seconds, refresh workability dots (`renderAll()`), and update status cards.
2. **Component Default State & Preference Persistence (R2)**:
   - In `renderPluginTable()` (`page/app.js:1536`):
     - Change default from `true` to `false`:
       ```javascript
       // Default to unchecked / disabled on first connection or initial startup
       const isEnabled = activeMap[plugin.id] === true;
       ```
     - Persist selections into `ide.plugins[plugin.id]`.
     - When components are toggled, update local preferences in `ide.plugins` and save to `localStorage` / config without immediately executing filesystem links until `"Connect"` is clicked.
3. **Deduplication in `saveIdeBtn` (`page/app.js:2310–2314`)**:
   - Replace timestamped ID generation with bridge replacement logic:
     ```javascript
     const baseId = (agentType !== "custom" ? agentType : name).toLowerCase().replace(/[^a-z0-9]/g, "-");
     const existingIndex = hubConfig.ides.findIndex(
       (i) => i.id === baseId || (i.agentType === agentType && i.configPath === configPath)
     );
     if (existingIndex !== -1) {
       // Replace existing bridge rather than creating duplicate
       hubConfig.ides[existingIndex] = {
         ...hubConfig.ides[existingIndex],
         name,
         agentType,
         exePath,
         configPath,
         componentPaths,
       };
       currentSelection = { type: "ide", id: hubConfig.ides[existingIndex].id };
     } else {
       hubConfig.ides.push({ id: baseId, name, agentType, exePath, configPath, componentPaths, enabled: true, plugins: {} });
       currentSelection = { type: "ide", id: baseId };
     }
     ```
4. **Eliminate Native Dialogs (Safety Invariant 4)**:
   - Remove `alert(...)` at lines 2294 and 2331. Replace with inline validation banners.

---

### 6.6 New Test Suite: `tests/single-bridge-replacement.test.mjs`

Add a dedicated unit/integration test suite covering:
1. Connecting to the same agent multiple times with different component sets replaces the bridge without duplicate IDs.
2. Verify old components are severed (unlinked from filesystem, removed from `mcp.json`/`CLAUDE.md`) and new components are created.
3. Verify `hubConfig.ides` contains exactly 1 entry for that agent.
4. Verify `agent-space-bridge.json:activeAgents` has exactly 1 entry.
5. Verify `shared/agent-connectors.json:connectors` has exactly 1 entry.
6. Verify no duplicate handoff inbox directories exist in `shared/handoff/`.
7. Verify that zero GUI processes are terminated (`hot-reload-protected`).
8. Verify that no 0-byte or empty `{}` stub files remain.

---

## 7. Verification Method

To verify the single bridge replacement behavior:
1. **Automated Test Run**:
   ```powershell
   rtk npm test
   ```
   All tests in `tests/*.test.mjs` (including the baseline 41 tests and new bridge replacement tests) must pass with 100% success rate.
2. **Filesystem Inspection**:
   - Check `<hubRoot>/agent-space-bridge.json` before and after reconnection. Verify `activeAgents.length` remains 1.
   - Check `<hubRoot>/shared/agent-connectors.json`. Verify only 1 connector key exists for the target agent.
   - Check `~/.agent-space-manager/state/`. Verify only `ide-<canonicalId>.json` exists without timestamped siblings.
   - Inspect the target agent directory to confirm unselected components are cleanly pruned.
3. **Safety Invariants Audit**:
   - Run `sanitizeAgentConfigDirectory` to verify zero stub files exist.
   - Inspect rule markdown files to confirm presence of `trigger: always_on`.
