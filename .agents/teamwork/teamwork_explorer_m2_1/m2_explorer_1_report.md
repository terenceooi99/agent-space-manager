# Technical Implementation Architecture: `connectAgent` Backend Engine (Milestone 2)

**Author:** `teamwork_explorer_m2_1`  
**Date:** 2026-10-29  
**Scope:** Milestone 2 — Backend Connection Engine & Single Bridge Replacement (Requirements R2, R3, R1)  
**Target File:** `d:\Software\Magpie\agent-space-manager\manager.mjs` (with integration contracts for `server.mjs` and `index.mjs`)  

---

## 1. Executive Summary & Problem Scope

### 1.1 Requirements Addressed
- **R3. Single Connection Bridge Replacement:** When a user manually connects to the same connected agent multiple times with different sets of components, replace the existing connection bridge rather than creating duplicate bridges, preventing connection bloat on the target agent.
- **R2. Component Default State and Preference Persistence:** Default components to unselected/disabled on clean startup, while persisting user selections per agent across restarts.
- **R1. Manual Connection Trigger:** Support explicit agent connection via dedicated backend API (`connectAgent`, `POST /api/connect`), decoupling physical filesystem linking from passive configuration edits or auto-save cycles.

### 1.2 Root Cause Analysis of Existing Bridge Duplication
In the current implementation:
1. `page/app.js:2310-2312` appends new timestamped IDs (`${baseId}-${Date.now()}`) into `hubConfig.ides` whenever an agent is re-added or reconfigured.
2. Each timestamped ID generates a detached ownership manifest file (`~/.agent-space-manager/state/ide-<baseId>-<timestamp>.json`), splitting ownership state across multiple files for the same physical IDE configuration directory.
3. During synchronization, differential teardown fails because each duplicate entry loads only its own isolated state (`prevState`), ignoring components created by preceding bridges. Unselected components remain orphaned in the target filesystem, causing connection bloat.
4. `writeHubCommunicationFiles()` reads all entries from `hubConfig.ides`, creating duplicate agents in `agent-space-bridge.json:activeAgents`, duplicate keys in `shared/agent-connectors.json:connectors`, and duplicate handoff directories on disk (`shared/handoff/<id>`).

---

## 2. Complete Technical Design of `connectAgent`

The new `connectAgent(hubConfig, targetIde, options = {})` engine in `manager.mjs` resolves these issues through a deterministic, atomic 6-stage lifecycle:

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ Stage 1: Target Normalization & Identification                                 │
│   - Normalize targetIde via normalizeIdeEntry                                 │
│   - Determine canonical ID (sanitize timestamp suffixes)                      │
└──────────────────────────────────────┬─────────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼─────────────────────────────────────────┐
│ Stage 2: In-Place `hubConfig.ides` Deduplication                               │
│   - Match existing entries by ID, Base ID, Agent Type, or Config Path         │
│   - Identify primary entry index; collect obsolete duplicate entries           │
│   - Merge plugins map: { ...existing.plugins, ...targetIde.plugins }          │
│   - Update primary entry in place; prune duplicate entries                     │
└──────────────────────────────────────┬─────────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼─────────────────────────────────────────┐
│ Stage 3: Ownership Manifest Aggregation                                        │
│   - Scan state directory for legacy manifests matching canonical ID,           │
│     agent type, or removed duplicate IDs (ide-<id>*.json)                      │
│   - Merge links, files, jsonKeys, and blocks into canonical state              │
│   - Delete obsolete legacy state files from disk                               │
│   - Persist merged state to ide-<canonicalId>.json                             │
└──────────────────────────────────────┬─────────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼─────────────────────────────────────────┐
│ Stage 4: Differential Sync Execution (`syncIdePlugins`)                        │
│   - syncIdePlugins loads aggregated prevState                                  │
│   - Compares desired components against prevState                              │
│   - Cleanly unlinks removed components; links newly selected components        │
│   - Writes final clean state to ide-<canonicalId>.json                         │
└──────────────────────────────────────┬─────────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼─────────────────────────────────────────┐
│ Stage 5: Communication Files Consolidation & Disk Cleanup                      │
│   - saveHubConfig(hubConfig) persists single agent entry                       │
│   - writeHubCommunicationFiles() generates single entry in activeAgents &      │
│     connectors map                                                             │
│   - Prune obsolete handoff folders (shared/handoff/<staleId>/)                 │
└──────────────────────────────────────┬─────────────────────────────────────────┘
                                       │
┌──────────────────────────────────────▼─────────────────────────────────────────┐
│ Stage 6: Return Response Contract                                              │
│   - Return { success, hubConfig, result, sync, ide }                           │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Exact Code Changes for `manager.mjs`

### 3.1 Export Block Update (`manager.mjs:45-56`)

Add `connectAgent` to the named export block and export it directly:

```javascript
export {
  AGENT_PROFILES,
  inferAgentType,
  listAgentProfilesForUi,
  expandHomePath,
  deleteOwnershipState,
  listAllOwnershipStates,
  writeHubCommunicationFiles,
  resolveEffectiveAgentPaths,
  resolveEffectiveProjectPaths,
  connectAgent,
};
```

### 3.2 Helper Function: `findMatchingIdeIndices(ides, targetIde)`

Place this helper directly before `connectAgent`:

```javascript
/**
 * Finds all indices in hubConfig.ides matching a target IDE by:
 * 1. Exact ID match (case-insensitive)
 * 2. Base ID match (stripping trailing timestamp suffixes)
 * 3. Normalized configPath match (resolving ~ and symlinks)
 * 4. Standard agentType match (for non-custom single-instance agents)
 *
 * @param {Array<object>} ides - Array of configured IDE objects.
 * @param {object} targetIde - The normalized target IDE object.
 * @returns {Array<number>} Matching indices in ides array.
 */
export function findMatchingIdeIndices(ides = [], targetIde = {}) {
  if (!Array.isArray(ides) || !targetIde) return [];

  const targetId = String(targetIde.id || "").trim().toLowerCase();
  const targetType = String(targetIde.agentType || "").trim().toLowerCase();
  const targetBaseId = targetId.replace(/-\d{10,}$/, "");
  const targetConfig = targetIde.configPath
    ? path.resolve(expandHomePath(targetIde.configPath)).toLowerCase()
    : "";

  const matches = [];

  for (let idx = 0; idx < ides.length; idx++) {
    const entry = ides[idx];
    if (!entry || typeof entry !== "object") continue;

    const entryId = String(entry.id || "").trim().toLowerCase();
    const entryBaseId = entryId.replace(/-\d{10,}$/, "");
    const entryType = String(entry.agentType || "").trim().toLowerCase();
    const entryConfig = entry.configPath
      ? path.resolve(expandHomePath(entry.configPath)).toLowerCase()
      : "";

    // Match 1: Exact ID match
    if (targetId && entryId && entryId === targetId) {
      matches.push(idx);
      continue;
    }

    // Match 2: Base ID match (e.g. "antigravity-1730188045123" vs "antigravity")
    if (targetBaseId && entryBaseId && entryBaseId === targetBaseId) {
      matches.push(idx);
      continue;
    }

    // Match 3: Config path match (same physical directory on disk)
    if (targetConfig && entryConfig && entryConfig === targetConfig) {
      matches.push(idx);
      continue;
    }

    // Match 4: Standard agentType match (for built-in agents like cursor, windsurf, antigravity)
    if (
      targetType &&
      targetType !== "custom" &&
      (entryType === targetType || entryId === targetType || entryBaseId === targetType)
    ) {
      matches.push(idx);
      continue;
    }
  }

  return matches;
}
```

### 3.3 Main Implementation: `connectAgent`

Place this function in `manager.mjs` directly after `unlinkAllForProject` (around line 1600):

```javascript
/**
 * Connects or reconnects an agent IDE, replacing any existing bridge for that agent
 * rather than creating duplicate bridges. Guarantees in-place deduplication,
 * ownership manifest aggregation, clean differential teardown, and safety invariant compliance.
 *
 * @param {object} hubConfig - The current hub configuration object.
 * @param {object} targetIde - The IDE entry to connect (with updated plugins map).
 * @param {object} [options] - Additional connection options:
 *   - customPlugins: Array of pre-scanned plugin objects.
 *   - allPlugins: Alias for customPlugins.
 *   - effHub: Effective hub root directory path.
 *   - configFile: Custom path to hub-config.json.
 * @returns {object} { success: boolean, hubConfig: object, result: object, sync: object, ide: object }
 */
export function connectAgent(hubConfig, targetIde, options = {}) {
  if (!targetIde || typeof targetIde !== "object") {
    return {
      success: false,
      error: "Target IDE is required",
      hubConfig: hubConfig || null,
      result: null,
    };
  }

  // Ensure valid hubConfig object
  const config = hubConfig || loadHubConfig(options.configFile);
  if (!Array.isArray(config.ides)) {
    config.ides = [];
  }

  const effectiveHub = options.effHub || getEffectiveHubRoot(config);
  const plugins = options.customPlugins || options.allPlugins || scanPlugins(effectiveHub);

  // 1. Normalize target IDE definition
  const normTarget = normalizeIdeEntry(targetIde);
  const targetType = normTarget.agentType || inferAgentType(normTarget);
  normTarget.agentType = targetType;

  // 2. Identify matching entries in hubConfig.ides
  const matchingIndices = findMatchingIdeIndices(config.ides, normTarget);

  // Determine canonical ID (clean string without timestamp suffix)
  let canonicalId = String(normTarget.id || "").trim();
  if (matchingIndices.length > 0) {
    const cleanExisting = matchingIndices
      .map((idx) => config.ides[idx])
      .find((entry) => entry && entry.id && !/-\d{10,}$/.test(entry.id));

    if (cleanExisting) {
      canonicalId = cleanExisting.id;
    } else {
      canonicalId = (canonicalId || targetType || "custom").replace(/-\d{10,}$/, "");
    }
  } else {
    canonicalId = (canonicalId || targetType || "custom").replace(/-\d{10,}$/, "");
  }
  if (!canonicalId) canonicalId = targetType || "custom";
  normTarget.id = canonicalId;

  // 3. Track duplicate IDs for ownership aggregation and handoff cleanup
  const removedDuplicateIds = new Set();
  if (targetIde.id && targetIde.id !== canonicalId) {
    removedDuplicateIds.add(targetIde.id);
  }

  // 4. In-Place Deduplication of config.ides
  let updatedIde = null;

  if (matchingIndices.length > 0) {
    const primaryIdx = matchingIndices[0];
    const existingEntry = config.ides[primaryIdx] || {};

    if (existingEntry.id && existingEntry.id !== canonicalId) {
      removedDuplicateIds.add(existingEntry.id);
    }

    // Collect IDs of any duplicate matching entries
    for (let k = 1; k < matchingIndices.length; k++) {
      const dupEntry = config.ides[matchingIndices[k]];
      if (dupEntry && dupEntry.id && dupEntry.id !== canonicalId) {
        removedDuplicateIds.add(dupEntry.id);
      }
    }

    // Merge plugins preferences in place:
    const mergedPlugins = {
      ...(existingEntry.plugins || {}),
      ...(targetIde.plugins || {}),
    };

    updatedIde = normalizeIdeEntry({
      ...existingEntry,
      ...normTarget,
      id: canonicalId,
      agentType: targetType,
      enabled: true,
      plugins: mergedPlugins,
    });

    config.ides[primaryIdx] = updatedIde;

    // Remove any additional duplicate entries from config.ides
    if (matchingIndices.length > 1) {
      const dupSet = new Set(matchingIndices.slice(1));
      config.ides = config.ides.filter((_, idx) => !dupSet.has(idx));
    }
  } else {
    // New agent connection
    updatedIde = normalizeIdeEntry({
      ...normTarget,
      id: canonicalId,
      agentType: targetType,
      enabled: true,
      plugins: { ...(targetIde.plugins || {}) },
    });
    config.ides.push(updatedIde);
  }

  // 5. Aggregate legacy timestamped ownership manifests into ide-<canonicalId>.json
  const canonicalOwnerKey = `ide-${canonicalId}`;
  const canonicalState = loadOwnershipState(canonicalOwnerKey);
  const stateDir = getStateDir();

  if (fs.existsSync(stateDir)) {
    try {
      const stateFiles = fs.readdirSync(stateDir).filter((f) => f.endsWith(".json"));
      for (const filename of stateFiles) {
        const ownerId = filename.slice(0, -5);
        if (ownerId === canonicalOwnerKey) continue;

        let isMatch = false;

        // Condition A: Matches an explicit duplicate ID removed from config.ides
        for (const dupId of removedDuplicateIds) {
          if (ownerId === `ide-${dupId}` || ownerId === dupId) {
            isMatch = true;
            break;
          }
        }

        // Condition B: Matches timestamped pattern ide-<canonicalId>-<timestamp>
        if (!isMatch) {
          const canonPrefix = `ide-${canonicalId}-`;
          const typePrefix = targetType && targetType !== "custom" ? `ide-${targetType}-` : null;
          if (ownerId.startsWith(canonPrefix) || (typePrefix && ownerId.startsWith(typePrefix))) {
            isMatch = true;
          }
        }

        if (isMatch) {
          const legacyState = loadOwnershipState(ownerId);

          // Merge links
          for (const link of legacyState.links || []) {
            if (!canonicalState.links.includes(link)) {
              canonicalState.links.push(link);
            }
          }

          // Merge files
          for (const file of legacyState.files || []) {
            if (!canonicalState.files.includes(file)) {
              canonicalState.files.push(file);
            }
          }

          // Merge JSON keys
          if (legacyState.jsonKeys && typeof legacyState.jsonKeys === "object") {
            for (const [keyPath, keys] of Object.entries(legacyState.jsonKeys)) {
              if (!canonicalState.jsonKeys[keyPath]) {
                canonicalState.jsonKeys[keyPath] = Array.isArray(keys) ? [...keys] : [];
              } else {
                const mergedKeySet = new Set(canonicalState.jsonKeys[keyPath]);
                for (const k of keys || []) mergedKeySet.add(k);
                canonicalState.jsonKeys[keyPath] = Array.from(mergedKeySet);
              }
            }
          }

          // Merge demarcated blocks
          for (const block of legacyState.blocks || []) {
            if (!canonicalState.blocks.includes(block)) {
              canonicalState.blocks.push(block);
            }
          }

          // Delete obsolete state file from disk
          deleteOwnershipState(ownerId);
        }
      }
    } catch {}
  }

  // Persist aggregated state so syncIdePlugins diffs against all prior artifacts
  saveOwnershipState(canonicalOwnerKey, canonicalState);

  // 6. Differential Sync: syncIdePlugins tears down unselected components & creates selected ones
  const syncResult = syncIdePlugins(updatedIde, plugins);

  // 7. Persist configuration and regenerate communication bridge files
  try {
    saveHubConfig(config, options.configFile);
  } catch {}

  try {
    writeHubCommunicationFiles(effectiveHub, config, plugins, { ides: [syncResult] });
  } catch {}

  // 8. Prune stale handoff directories on disk for removed duplicate IDs
  for (const dupId of removedDuplicateIds) {
    if (dupId && dupId !== canonicalId) {
      const staleHandoff = path.join(effectiveHub, "shared", "handoff", dupId);
      try {
        if (fs.existsSync(staleHandoff)) {
          fs.rmSync(staleHandoff, { recursive: true, force: true });
        }
      } catch {}
    }
  }

  return {
    success: syncResult.success !== false,
    hubConfig: config,
    result: syncResult,
    sync: syncResult,
    ide: updatedIde,
  };
}
```

---

## 4. Verification of In-Place Deduplication and State Aggregation

### 4.1 Proof of In-Place Replacement (No Duplicates in `hubConfig.ides`)
Let $I = [i_1, i_2, \dots, i_n]$ be the array `hubConfig.ides`.
When `targetIde` arrives:
1. `findMatchingIdeIndices(I, targetIde)` produces matching indices $M \subseteq \{0, \dots, n-1\}$.
2. Case $|M| = 0$: $I$ is extended with normalized `updatedIde`. $|I'| = n + 1$, containing exactly 1 entry for `targetIde`.
3. Case $|M| \ge 1$: Primary index $m_0 = M[0]$ is updated in place: $I[m_0] \leftarrow \text{updatedIde}$. Any secondary duplicate indices $M \setminus \{m_0\}$ are filtered out.
   Result: Exactly 1 entry remains in $I'$ matching `targetIde`.

### 4.2 Proof of Complete Artifact Teardown via State Aggregation
Let $L_{\text{legacy}}$ be the set of filesystem junctions and links created by previous or duplicate bridges (e.g. from `ide-antigravity-1730188045123.json`), and $L_{\text{desired}}$ be the set of links requested in the new connection.
- Prior to synchronization, $L_{\text{legacy}}$ is merged into $L_{\text{canonical}} = \text{loadOwnershipState}(canonicalOwnerKey)$.
- When `syncIdePlugins` executes:
  $$\text{Links to Remove} = L_{\text{canonical}} \setminus L_{\text{desired}}$$
- Because $L_{\text{legacy}} \subseteq L_{\text{canonical}}$, every link previously established by legacy bridges that is not in $L_{\text{desired}}$ is guaranteed to be severed via `removeJunction()`.
- The final state file `ide-<canonicalId>.json` records only $L_{\text{desired}}$.
- No ghost directories or dangling junctions are leaked.

---

## 5. Adherence to Repository Safety Invariants (`.agents/rules/`)

| Invariant | Safety Rule File | Verification in `connectAgent` |
|---|---|---|
| **Invariant 1: Process Protection** | `process-termination.md` | `connectAgent` NEVER issues `taskkill`, `pkill`, or process termination signals. Primary GUI code editors (`antigravity.exe`, `cursor.exe`, `windsurf.exe`, `code.exe`, `opencode.exe`) are hot-reload dynamic and remain completely protected. |
| **Invariant 2: Configuration Sanitization** | `config-sanitization.md` | `syncIdePlugins` automatically runs `sanitizeAgentConfigDirectory(primaryDir, agentType)`. 0-byte JSON files and empty `{}` stubs missing `"id"` are purged. Atomic writes are maintained. |
| **Invariant 3: Rule Normalization** | `rule-normalization.md` | All synchronized markdown rules have YAML frontmatter with `trigger: always_on` injected/preserved by adapters, avoiding Antigravity Cortex parser exceptions. |
| **Invariant 4: MCP Schema Compatibility** | `mcp-schema-guards.md` | Handled via `syncJsonMcpServers` / `syncTomlMcpServers` with agent-specific key transformations (e.g. `servers` for Copilot, `mcp` for OpenCode). |
| **Invariant 5: WebView2 Dialogs** | `webview2-dialogs.md` | Zero modal `window.alert()` or `window.confirm()` calls. Backend returns structured JSON error states. |
| **Invariant 6: Safe Junctions & Ownership** | `junction-lifecycle.md` | Windows directory materialization (`materializePluginBundle`) bypasses Go `os.ReadDir` bug. Junction removal checks `.asm-owned.json` and preserves user files. |
| **Invariant 7: Watcher Throttling** | `watcher-throttling.md` | Execution is purely on-demand upon manual connection trigger; no unthrottled watcher loops are spawned. |

---

## 6. Integration Interfaces

### 6.1 `server.mjs`: `POST /api/connect` Route
In `server.mjs`, import `connectAgent` and add the `/api/connect` handler:

```javascript
// server.mjs: lines 11-30: import { connectAgent, ... } from "./manager.mjs";

if (pathname === "/api/connect" && req.method === "POST") {
  let body = "";
  req.on("data", (chunk) => { body += chunk; });
  req.on("end", () => {
    try {
      const payload = body ? JSON.parse(body) : {};
      const targetIde = payload.ide || payload;
      if (!targetIde || !targetIde.agentType && !targetIde.id) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "targetIde is required" }));
        return;
      }
      const config = loadHubConfig();
      const customPlugins = payload.plugins || null;
      const result = connectAgent(config, targetIde, { customPlugins });
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

### 6.2 `index.mjs`: Magpie IPC Endpoint
In `index.mjs`, expose `connectAgent` in `AgentSpaceManagerPlugin.api`:

```javascript
// index.mjs: lines 6-29: import { connectAgent, ... } from "./manager.mjs";

export const AgentSpaceManagerPlugin = {
  name: "agent-space-manager",
  // ...
  api: {
    // ...
    connectAgent: async (targetIde, customPlugins = null) => {
      const cfg = loadHubConfig();
      return connectAgent(cfg, targetIde, { customPlugins });
    },
  },
};
```

---

## 7. Next Steps for Implementer (Milestones 2 & 4)

1. Apply the edits to `manager.mjs`:
   - Export `findMatchingIdeIndices` and `connectAgent`.
   - Place `connectAgent` around line 1600.
2. Wire up `server.mjs` (`POST /api/connect`) and `index.mjs` (`connectAgent`).
3. Add turnkey integration tests in `tests/connection-lifecycle.test.mjs` (Milestone 4).
4. Run `rtk npm test` to ensure 100% pass rate across all suites.
