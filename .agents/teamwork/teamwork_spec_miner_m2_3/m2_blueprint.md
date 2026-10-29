# Milestone 2 Implementation Blueprint: Backend Connection Engine, API Routes & IPC Architecture

**Author:** `teamwork_spec_miner_m2_3`  
**Target Milestone:** Milestone 2 (Requirements R1, R2, R3)  
**Target Files:**
- `manager.mjs`
- `adapters.mjs`
- `server.mjs`
- `index.mjs`
- `tests/workability-status.test.mjs` (test suite alignment)

---

## 1. Executive Summary & Architectural Scope

Milestone 2 establishes the backend foundation for manual agent connections, single bridge replacement, and component default state inversion in Agent Space Manager.

### Core Objectives:
1. **Decouple Config Persistence from Physical Sync (R1)**:
   - Saving settings or toggles (`POST /api/save` and `saveConfig` IPC) must persist `hub-config.json` without automatically initiating physical filesystem linking (`syncAllIdes()`), unless an explicit `sync: true` or `connect: true` flag is passed.
2. **Component Default State Inversion (R2)**:
   - On clean startup or first connection to an agent, missing or unset components in `plugins: {}` must evaluate strictly to `false` (`=== true` required).
   - Only explicitly enabled components (`plugins[plugin.id] === true`) are materialized/linked on disk.
3. **Single Connection Bridge Replacement & Deduplication (R3)**:
   - When connecting to an agent via `connectAgent` / `POST /api/connect`:
     - Deduplicate `hubConfig.ides` in-place by `id`, `agentType`, or `configPath`.
     - Aggregate any legacy timestamped ownership manifests (`ide-<id>*.json`) into `ide-<id>.json`.
     - Perform differential sync (`syncIdePlugins`) to cleanly tear down unselected components and link newly selected ones.
     - Regenerate `agent-space-bridge.json` and `shared/agent-connectors.json` ensuring exactly one canonical bridge entry for this agent.
     - Prune obsolete handoff folders (`shared/handoff/<staleId>`).
4. **API & IPC Surface (R1, R3)**:
   - Add `POST /api/connect` in `server.mjs`.
   - Expose `connectAgent` in `AgentSpaceManagerPlugin.api` in `index.mjs`.
   - Ensure CORS origin security, non-destructive atomic backups (`.asm-bak`), and strict compliance with the 7 safety invariants.

---

## 2. Component Interaction & Connection Lifecycle Diagram

```
[ Frontend: page/app.js ] ──(Click #connectBtn)──> [ POST /api/connect ] (server.mjs)
                                                           │
                                                           │ Or Magpie Host IPC
                                                           ▼
                                            [ AgentSpaceManagerPlugin.api.connectAgent ] (index.mjs)
                                                           │
                                                           ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│ manager.mjs: connectAgent(hubConfig, targetIde, options)                                     │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ 1. Match & Resolve Canonical Agent                                                           │
│    - Deduplicate against hubConfig.ides by id, agentType, and configPath                     │
│    - Retain canonical baseId (e.g. "antigravity", "claude-code")                             │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ 2. Pre-Sync Sanitization (Safety Invariant 2)                                                │
│    - sanitizeAgentConfigDirectory(primaryDir, agentType)                                     │
│    - Prune 0-byte project manifests and empty ghost directories                              │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ 3. Aggregate Legacy Ownership States                                                         │
│    - Scan ~/.agent-space-manager/state/ for ide-<canonicalId>-*.json                         │
│    - Merge links, files, jsonKeys, and blocks into canonical ide-<canonicalId>.json          │
│    - Delete stale timestamped state files                                                    │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ 4. Differential Sync (syncIdePlugins)                                                        │
│    - Component check: plugins[plugin.id] === true (Default Inversion)                        │
│    - Sever junctions & unlink unselected components                                          │
│    - Link newly selected components with .asm-owned.json                                     │
│    - Normalize rule frontmatter: trigger: always_on (Safety Invariant 3)                     │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ 5. Communication Files & In-Place Config Persistence                                         │
│    - Update hubConfig.ides[existingIndex] with latest plugins preferences                    │
│    - saveHubConfig(hubConfig) (deduplicating entries)                                        │
│    - writeHubCommunicationFiles() -> single entry in agent-space-bridge.json & connectors    │
│    - Prune obsolete handoff dropboxes: shared/handoff/<staleId>/                             │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Module Specifications & Exact Code Implementations

### Module 1: `manager.mjs`

#### 1.1 Component Default Inversion: `syncIdePlugins` (Bundle Mode)
**File:** `manager.mjs` (Line 1151)
```javascript
// BEFORE:
const isEnabled = normalized.plugins ? normalized.plugins[plugin.id] !== false : true;

// AFTER:
const isEnabled = Boolean(normalized.plugins && normalized.plugins[plugin.id] === true);
```
**Rationale:** Missing or undefined entries in `normalized.plugins` evaluate to `false`, guaranteeing that unselected components remain disabled by default on clean startup or first connection.

#### 1.2 Component Default Inversion: `evaluateComponentAgentWorkability`
**File:** `manager.mjs` (Line 2404)
```javascript
// BEFORE:
const isEnabled = ide.plugins ? ide.plugins[plugin.id] !== false : true;

// AFTER:
const isEnabled = Boolean(ide.plugins && ide.plugins[plugin.id] === true);
```
**Rationale:** When an agent has not enabled a component, its status dot correctly evaluates to red (`status: "disabled"`, `summary: "Disabled for <Agent>"`), reflecting the unselected state until explicitly toggled and connected.

#### 1.3 Helper Function: `deduplicateIdes(ides)`
**File:** `manager.mjs` (Place above `saveHubConfig`)
```javascript
/**
 * Deduplicates an array of IDE entries in-place, merging component selections
 * and ensuring only one canonical entry exists per agent type or config path.
 *
 * @param {Array<object>} ides - Array of IDE configuration entries.
 * @returns {Array<object>} Deduplicated array of normalized IDE entries.
 */
export function deduplicateIdes(ides = []) {
  if (!Array.isArray(ides)) return [];
  const seenIds = new Set();
  const seenTargets = new Set();
  const result = [];

  for (const raw of ides) {
    if (!raw) continue;
    const ide = normalizeIdeEntry(raw);
    const idKey = ide.id;
    const normConfig = ide.configPath ? path.resolve(expandHomePath(ide.configPath)) : "";
    const targetKey = `${ide.agentType}::${normConfig}`;

    const existing = result.find((item) => {
      if (item.id === idKey) return true;
      if (normConfig && item.agentType === ide.agentType) {
        const itemConfig = item.configPath ? path.resolve(expandHomePath(item.configPath)) : "";
        if (itemConfig === normConfig) return true;
      }
      return false;
    });

    if (existing) {
      // Merge preferences into canonical entry
      existing.plugins = { ...(existing.plugins || {}), ...(ide.plugins || {}) };
      if (ide.componentPaths) {
        existing.componentPaths = { ...(existing.componentPaths || {}), ...ide.componentPaths };
      }
      if (ide.exePath && !existing.exePath) existing.exePath = ide.exePath;
      if (ide.name && (!existing.name || existing.name === existing.id)) existing.name = ide.name;
      continue;
    }

    seenIds.add(idKey);
    if (normConfig) seenTargets.add(targetKey);
    result.push(ide);
  }
  return result;
}
```

#### 1.4 Update `saveHubConfig` to Automatically Deduplicate
**File:** `manager.mjs` (Lines 591–598)
```javascript
/**
 * Saves hub configuration to file (UTF-8 without BOM) with automated IDE deduplication.
 */
export function saveHubConfig(config, configFile = null) {
  const effectiveFile = configFile || path.join(resolveHubRoot(), "hub-config.json");
  if (config && Array.isArray(config.ides)) {
    config.ides = deduplicateIdes(config.ides);
  }
  ensureDir(path.dirname(effectiveFile));
  fs.writeFileSync(effectiveFile, JSON.stringify(config, null, 2), "utf8");
}
```

#### 1.5 New Core Function: `connectAgent(hubConfig, targetIde, options = {})`
**File:** `manager.mjs` (Add to export and implement)
```javascript
/**
 * Connects or reconnects an agent IDE, replacing any existing bridge for that agent
 * rather than creating duplicate bridges. Guarantees clean differential teardown,
 * ownership consolidation, and safety invariant compliance.
 *
 * @param {object} hubConfig - The current hub configuration object.
 * @param {object} targetIde - The IDE entry to connect (with updated plugins map).
 * @param {object} [options] - Additional connection options (customPlugins, effHub, skipSave).
 * @returns {object} { success: boolean, hubConfig: object, result: object, bridge: object, activeAgents: Array, ide: object }
 */
export function connectAgent(hubConfig, targetIde, options = {}) {
  if (!targetIde || typeof targetIde !== "object") {
    return { success: false, error: "Missing or invalid targetIde" };
  }

  const cfg = hubConfig || loadHubConfig();
  if (!Array.isArray(cfg.ides)) cfg.ides = [];

  const effHub = options.effHub || getEffectiveHubRoot(cfg);
  const plugins = options.customPlugins || scanPlugins(effHub);

  // 1. Normalize and resolve canonical ID
  const normTarget = normalizeIdeEntry(targetIde);
  const baseId = normTarget.id ? normTarget.id.replace(/-\d{10,}$/, "") : normTarget.agentType;
  const targetType = normTarget.agentType;
  const targetConfig = normTarget.configPath ? path.resolve(expandHomePath(normTarget.configPath)) : "";

  // Match existing entry by id, baseId, or (agentType + configPath)
  let existingIndex = cfg.ides.findIndex((i) => i.id === normTarget.id || i.id === baseId);
  if (existingIndex === -1 && targetConfig) {
    existingIndex = cfg.ides.findIndex((i) => {
      const iConfig = i.configPath ? path.resolve(expandHomePath(i.configPath)) : "";
      return i.agentType === targetType && iConfig === targetConfig;
    });
  }

  const canonicalId = existingIndex !== -1 ? cfg.ides[existingIndex].id : (baseId || normTarget.id);
  normTarget.id = canonicalId;

  // 2. Aggregate ownership states (canonical + any legacy timestamped manifests)
  const canonicalOwnerKey = `ide-${canonicalId}`;
  const aggregatedPrevState = loadOwnershipState(canonicalOwnerKey);

  // Scan state dir for any timestamped states matching ide-<canonicalId>-*.json or ide-<targetType>-*.json
  const stateDir = getStateDir();
  const obsoleteOwnerKeys = [];
  try {
    if (fs.existsSync(stateDir)) {
      for (const ent of fs.readdirSync(stateDir)) {
        if (!ent.endsWith(".json")) continue;
        const ownerKey = ent.slice(0, -5);
        if (ownerKey === canonicalOwnerKey) continue;
        const isTimestampedMatch =
          ownerKey.startsWith(`ide-${canonicalId}-`) ||
          (targetType && ownerKey.startsWith(`ide-${targetType}-`));
        if (isTimestampedMatch) {
          const dupState = loadOwnershipState(ownerKey);
          aggregatedPrevState.links.push(...(dupState.links || []));
          aggregatedPrevState.files.push(...(dupState.files || []));
          Object.assign(aggregatedPrevState.jsonKeys, dupState.jsonKeys || {});
          aggregatedPrevState.blocks.push(...(dupState.blocks || []));
          obsoleteOwnerKeys.push(ownerKey);
        }
      }
    }
  } catch {}

  // Prune obsolete states and persist aggregated state to canonical owner key
  for (const obsKey of obsoleteOwnerKeys) {
    deleteOwnershipState(obsKey);
  }
  saveOwnershipState(canonicalOwnerKey, aggregatedPrevState);

  // 3. Pre-sync directory sanitization (Safety Invariant 2)
  const primaryDir = normTarget.configPath ? expandHomePath(normTarget.configPath) : "";
  if (primaryDir && fs.existsSync(primaryDir)) {
    sanitizeAgentConfigDirectory(primaryDir, normTarget.agentType);
  }

  // 4. Update or replace the entry in hubConfig.ides
  const duplicatesToRemove = [];
  cfg.ides = cfg.ides.filter((i, idx) => {
    if (idx === existingIndex) return true;
    const isSameId = i.id === canonicalId;
    const isTimestampedSame = i.id && i.id.startsWith(`${canonicalId}-`);
    const isSameTarget =
      i.agentType === targetType &&
      targetConfig &&
      path.resolve(expandHomePath(i.configPath || "")) === targetConfig;
    if (isSameId || isTimestampedSame || isSameTarget) {
      duplicatesToRemove.push(i);
      return false;
    }
    return true;
  });

  const updatedIde = {
    ...(existingIndex !== -1 ? cfg.ides[existingIndex] : {}),
    ...normTarget,
    enabled: true,
    plugins: normTarget.plugins && typeof normTarget.plugins === "object" ? normTarget.plugins : {},
  };

  if (existingIndex !== -1) {
    cfg.ides[existingIndex] = updatedIde;
  } else {
    cfg.ides.push(updatedIde);
  }

  // 5. Differential Sync: syncIdePlugins tears down unselected and links newly selected components
  const syncResult = syncIdePlugins(updatedIde, plugins);

  // 6. Post-sync directory sanitization
  if (primaryDir && fs.existsSync(primaryDir)) {
    sanitizeAgentConfigDirectory(primaryDir, normTarget.agentType);
  }

  // 7. Persist configuration and regenerate communication bridge files
  if (options.skipSave !== true) {
    saveHubConfig(cfg);
  }

  try {
    writeHubCommunicationFiles(effHub, cfg, plugins, { ides: [syncResult] });
  } catch {}

  // 8. Clean up stale handoff folders for removed duplicate IDs
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

  // 9. Read fresh bridge payload
  let bridge = null;
  let activeAgents = [];
  try {
    const bridgeFile = path.join(effHub, "agent-space-bridge.json");
    if (fs.existsSync(bridgeFile)) {
      bridge = JSON.parse(fs.readFileSync(bridgeFile, "utf8"));
      activeAgents = bridge.activeAgents || [];
    }
  } catch {}

  return {
    success: syncResult.success !== false,
    hubConfig: cfg,
    result: syncResult,
    sync: syncResult,
    bridge: bridge || {},
    activeAgents,
    ide: updatedIde,
  };
}
```

#### 1.6 Export `connectAgent` and `deduplicateIdes` from `manager.mjs`
**File:** `manager.mjs` (Lines 45–56)
Add `connectAgent` and `deduplicateIdes` to the exports list.

---

### Module 2: `adapters.mjs`

#### 2.1 Component Default Inversion: `collectEnabledComponents`
**File:** `adapters.mjs` (Line 165)
```javascript
// BEFORE:
const isEnabled = enabledMap ? enabledMap[plugin.id] !== false : true;

// AFTER:
const isEnabled = Boolean(enabledMap && enabledMap[plugin.id] === true);
```
**Rationale:** In Native-Format Converted Agents (Claude Code, Codex, OpenCode, Cursor, Windsurf, Copilot, etc.), `collectEnabledComponents` collects skills, MCP servers, rules, subagents, and hooks. Changing `!== false` to `=== true` guarantees that an empty or missing `plugins` map results in 0 components collected, preventing automatic linking on fresh startup.

---

### Module 3: `server.mjs`

#### 3.1 Update Imports in `server.mjs`
**File:** `server.mjs` (Lines 11–30)
Add `connectAgent` to the imported functions from `./manager.mjs`.

#### 3.2 Add Route: `POST /api/connect`
**File:** `server.mjs` (Insert before `/api/save` around Line 309)
```javascript
      if (pathname === "/api/connect" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          try {
            const parsed = JSON.parse(body || "{}");
            const targetIde = parsed.ide && typeof parsed.ide === "object" ? parsed.ide : parsed;
            if (!targetIde || (!targetIde.id && !targetIde.agentType)) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ success: false, error: "Missing required agent id or agentType" }));
              return;
            }

            const config = loadHubConfig();
            const effHub = getEffectiveHubRoot(config);
            const customPlugins = Array.isArray(parsed.plugins) ? parsed.plugins : null;
            const connectRes = connectAgent(config, targetIde, {
              effHub,
              customPlugins,
            });

            // Ensure bridge and activeAgents are populated from file or return object
            let bridge = connectRes.bridge || null;
            let activeAgents = connectRes.activeAgents || [];
            if (!bridge || Object.keys(bridge).length === 0) {
              try {
                const bridgePath = path.join(effHub, "agent-space-bridge.json");
                if (fs.existsSync(bridgePath)) {
                  bridge = JSON.parse(fs.readFileSync(bridgePath, "utf8"));
                  activeAgents = bridge.activeAgents || [];
                }
              } catch {}
            }

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                success: connectRes.success !== false,
                bridge: bridge || {},
                activeAgents: activeAgents.length > 0 ? activeAgents : (bridge?.activeAgents || []),
                result: connectRes.result || connectRes.sync || connectRes,
                hubConfig: connectRes.hubConfig || config,
              })
            );
          } catch (err) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
        });
        return;
      }
```

#### 3.3 Decouple Route: `POST /api/save`
**File:** `server.mjs` (Lines 309–329)
```javascript
      if (pathname === "/api/save" && req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => { body += chunk; });
        req.on("end", () => {
          try {
            const raw = JSON.parse(body || "{}");
            const config = raw.config && typeof raw.config === "object" ? raw.config : raw;
            const shouldSync = Boolean(
              raw.sync === true ||
              raw.connect === true ||
              config.sync === true ||
              config.connect === true
            );

            saveHubConfig(config);
            const effPath = getEffectiveHubRoot(config);
            const plugins = Array.isArray(raw.plugins) ? raw.plugins : scanPlugins(effPath);
            const categories = buildCategoriesRegistry(plugins, effPath);
            updatePluginsCache(effPath, plugins, categories);

            let syncRes = null;
            if (shouldSync) {
              syncRes = syncAllIdes(config, plugins);
            }

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                success: true,
                config,
                pluginCount: plugins.length,
                plugins,
                categories,
                synced: shouldSync,
                ...(syncRes ? { sync: syncRes } : {}),
              })
            );
          } catch (err) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: err.message }));
          }
        });
        return;
      }
```

---

### Module 4: `index.mjs`

#### 4.1 Update Imports in `index.mjs`
**File:** `index.mjs` (Lines 7–30)
Add `connectAgent` to the imported functions from `./manager.mjs`.

#### 4.2 Decouple `saveConfig` in IPC
**File:** `index.mjs` (Lines 53–60)
```javascript
    saveConfig: async (config, options = {}) => {
      saveHubConfig(config);
      const effHub = getEffectiveHubRoot(config);
      const plugins = scanPlugins(effHub);
      const categories = buildCategoriesRegistry(plugins, effHub);
      const shouldSync = Boolean(
        options.sync === true ||
        options.connect === true ||
        config?.sync === true ||
        config?.connect === true
      );
      const sync = shouldSync ? syncAllIdes(config, plugins) : null;
      return {
        success: true,
        pluginCount: plugins.length,
        plugins,
        categories,
        synced: shouldSync,
        ...(sync ? { sync } : {}),
      };
    },
```

#### 4.3 Expose `connectAgent` in IPC
**File:** `index.mjs` (Add inside `AgentSpaceManagerPlugin.api`)
```javascript
    connectAgent: async (hubConfigOrIde, targetIdeOrOptions = {}, options = {}) => {
      let hubConfig;
      let targetIde;
      let opts;
      if (hubConfigOrIde && Array.isArray(hubConfigOrIde.ides)) {
        hubConfig = hubConfigOrIde;
        targetIde = targetIdeOrOptions;
        opts = options || {};
      } else {
        hubConfig = loadHubConfig();
        targetIde = hubConfigOrIde;
        opts = targetIdeOrOptions || {};
      }
      return connectAgent(hubConfig, targetIde, opts);
    },
```

---

## 4. Test Suite Alignment & Invariant Verification

### 4.1 `tests/workability-status.test.mjs`
Because `evaluateComponentAgentWorkability` previously used `ide.plugins[plugin.id] !== false` (defaulting to enabled when `plugins: {}`), the test for "returns green dot" passed an IDE with `plugins: {}`.
With default-disabled inversion (`=== true`):
1. In `tests/workability-status.test.mjs`, update `activeIde`:
   ```javascript
   const activeIde = {
     id: "claude-code",
     name: "Claude Code",
     agentType: "claude-code",
     configPath: "C:\\Users\\test\\.claude\\skills",
     enabled: true,
     plugins: { "alpha-plugin": true }, // Explicitly enabled for workability test
   };
   ```
2. Add a test explicitly asserting default-disabled behavior:
   ```javascript
   await t.test("returns red dot (disabled) when component is not in plugins map (default disabled)", () => {
     const unselectedIde = {
       ...activeIde,
       plugins: {}, // Default unchecked / unset
     };
     const res = evaluateComponentAgentWorkability(samplePlugin, unselectedIde);
     assert.equal(res.workable, false);
     assert.equal(res.color, "red");
     assert.equal(res.status, "disabled");
     assert.match(res.summary, /Disabled for Claude Code/);
   });
   ```

### 4.2 Verifying `tests/server.test.mjs` and `tests/ipc.test.mjs`
- `tests/server.test.mjs`: Tests `/api/save` with invalid hub and normal hub. Our updated `/api/save` continues to return `{ success: true, pluginCount, plugins, categories }`, guaranteeing 100% test pass.
- `tests/ipc.test.mjs`: Tests `api.getPlugins`, `api.getAgentProfiles`. Adding `api.connectAgent` expands the IPC surface without breaking existing calls.

---

## 5. Implementation Checklist for Worker M2

- [ ] **Step 1:** In `manager.mjs:1151`, update bundle component check to `Boolean(normalized.plugins && normalized.plugins[plugin.id] === true)`.
- [ ] **Step 2:** In `adapters.mjs:165`, update `collectEnabledComponents` check to `Boolean(enabledMap && enabledMap[plugin.id] === true)`.
- [ ] **Step 3:** In `manager.mjs:2404`, update `evaluateComponentAgentWorkability` check to `Boolean(ide.plugins && ide.plugins[plugin.id] === true)`.
- [ ] **Step 4:** In `manager.mjs`, implement `deduplicateIdes(ides)` and integrate into `saveHubConfig`.
- [ ] **Step 5:** In `manager.mjs`, implement `connectAgent(hubConfig, targetIde, options)` and export it.
- [ ] **Step 6:** In `server.mjs`, import `connectAgent`, implement `POST /api/connect`, and decouple `POST /api/save`.
- [ ] **Step 7:** In `index.mjs`, import `connectAgent`, expose `connectAgent` on `AgentSpaceManagerPlugin.api`, and decouple `saveConfig`.
- [ ] **Step 8:** In `tests/workability-status.test.mjs`, set `plugins: { "alpha-plugin": true }` on `activeIde` and add test for default-disabled state.
- [ ] **Step 9:** Execute `rtk npm test` to verify 100% test pass rate across all suites.
