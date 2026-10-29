# Technical Implementation Strategy: Component Default State Inversion (Requirement R2)

**Author**: `teamwork_explorer_m2_2`  
**Milestone**: Milestone 2 (Backend Connection Engine - Component Default State Inversion - Requirement R2)  
**Date**: 2026-10-29  
**Target Codebase**: `manager.mjs`, `adapters.mjs`, `tests/`  

---

## 1. Executive Summary

Requirement R2 mandates:
> *"On initial application startup or when connecting to an agent for the first time, all components must default to unchecked / disabled. Persist and restore user component selections for each connected agent across restarts and subsequent sessions."*

In the current implementation, every component enablement check in both the backend engine and frontend UI uses a fallback of `!== false`. When an agent configuration is freshly initialized with `plugins: {}` (or when a component is not yet present in the map), `plugins[plugin.id]` evaluates to `undefined`. Because `undefined !== false` evaluates to `true`, all components default to **enabled** across all connected agents.

To invert this behavior and fulfill Requirement R2:
1. All component enablement evaluations must be strictly replaced with `Boolean(plugins && plugins[plugin.id] === true)` (or `enabledMap ? enabledMap[plugin.id] === true : false`).
2. An empty map `plugins: {}`, `null`, `undefined`, or any value other than boolean `true` will strictly evaluate to `false` (disabled/unselected).
3. Component linking (`syncIdePlugins`, `collectEnabledComponents`, `syncPluginBundles`) will only link components explicitly marked with `=== true`.
4. Workability evaluations (`evaluateComponentAgentWorkability`) will indicate `workable: false`, `color: "red"`, `status: "disabled"` unless explicitly toggled on (`=== true`).
5. Existing test suites in `tests/` that relied on `plugins: {}` implicitly linking all components (`tests/workability-status.test.mjs`, `tests/sync-adapters.test.mjs`, `tests/sync-bundle.test.mjs`) must be updated with explicit `plugins: { [id]: true }` to maintain a 100% test pass rate, and new test assertions must be added to verify the default-disabled invariant.

---

## 2. Code Locations Analysis

### 2.1 Backend Location 1: `manager.mjs:1151` (Mode 1: Antigravity Bundle Sync)

- **File**: `manager.mjs`
- **Function**: `syncIdePlugins(ide, allPlugins)`
- **Current Code (lines 1149–1155)**:
  ```javascript
  const activePluginMap = new Map();
  for (const plugin of allPlugins) {
    const isEnabled = normalized.plugins ? normalized.plugins[plugin.id] !== false : true;
    if (isEnabled && plugin.path && fs.existsSync(plugin.path) && !plugin.isRootSkills) {
      activePluginMap.set(plugin.id, plugin.path);
    }
  }
  ```
- **Analysis**:
  - `activePluginMap` holds the plugins to be materialized into `~/.gemini/config/plugins/`.
  - When `normalized.plugins` is `{}` or missing, `normalized.plugins[plugin.id]` is `undefined`.
  - Since `undefined !== false` is `true`, every discovered hub plugin was materialized as a bundle.
- **Replacement Code**:
  ```javascript
  const activePluginMap = new Map();
  for (const plugin of allPlugins) {
    const isEnabled = Boolean(normalized.plugins && normalized.plugins[plugin.id] === true);
    if (isEnabled && plugin.path && fs.existsSync(plugin.path) && !plugin.isRootSkills) {
      activePluginMap.set(plugin.id, plugin.path);
    }
  }
  ```

---

### 2.2 Backend Location 2: `adapters.mjs:165` (Universal Component Collection)

- **File**: `adapters.mjs`
- **Function**: `collectEnabledComponents(allPlugins = [], enabledMap = {})`
- **Current Code (lines 164–167)**:
  ```javascript
  for (const plugin of allPlugins) {
    const isEnabled = enabledMap ? enabledMap[plugin.id] !== false : true;
    if (!isEnabled || !plugin.path || !fs.existsSync(plugin.path)) continue;
  ```
- **Analysis**:
  - `collectEnabledComponents` is the central collector used by:
    1. Antigravity flattened skills, rules, and subagents (`manager.mjs:1185`).
    2. Native-format converted agents (Claude Code, Codex, OpenCode, VS Code Copilot, Cursor, Windsurf, Gemini CLI, Cline, Roo Code, Kiro) (`manager.mjs:1299`).
    3. Project and workspace overrides (`manager.mjs:1427`).
  - When `enabledMap` is `{}` or omitted, `enabledMap[plugin.id]` is `undefined`.
  - Because `undefined !== false` is `true`, all skills, MCP servers, rules, subagents, and hooks from all plugins were collected and linked into the target agent.
- **Replacement Code**:
  ```javascript
  for (const plugin of allPlugins) {
    const isEnabled = Boolean(enabledMap && enabledMap[plugin.id] === true);
    if (!isEnabled || !plugin.path || !fs.existsSync(plugin.path)) continue;
  ```

---

### 2.3 Backend Location 3: `manager.mjs:2404` (Component Workability Status & Quick Actions)

- **File**: `manager.mjs`
- **Function**: `evaluateComponentAgentWorkability(plugin, ide, options = {})`
- **Current Code (lines 2403–2415)**:
  ```javascript
  // 3. Component toggled OFF for this specific agent
  const isEnabled = ide.plugins ? ide.plugins[plugin.id] !== false : true;
  if (!isEnabled) {
    return {
      workable: false,
      color: "red",
      status: "disabled",
      quickActions: { slashCommands: [], mentions: [], hasSlash: false, hasMention: false, hasMcp: false, hasRules: false },
      summary: `Disabled for ${ide.name || ide.id}`,
      tooltip: `🔴 Connection failed / Disabled: Component is toggled OFF for "${ide.name || ide.id}". Turn on toggle switch to connect.`,
      reason: `Component is toggled OFF for "${ide.name || ide.id}"`,
    };
  }
  ```
- **Analysis**:
  - Evaluates whether a component shows a green status dot (workable) vs red dot (disabled/unconfigured) in the UI.
  - When `ide.plugins` is `{}`, `ide.plugins[plugin.id]` is `undefined`.
  - `undefined !== false` evaluated to `true`, incorrectly displaying a green status dot for unselected components.
- **Replacement Code**:
  ```javascript
  // 3. Component toggled OFF / unselected for this specific agent (default is disabled/unselected)
  const isEnabled = Boolean(ide.plugins && ide.plugins[plugin.id] === true);
  if (!isEnabled) {
    return {
      workable: false,
      color: "red",
      status: "disabled",
      quickActions: { slashCommands: [], mentions: [], hasSlash: false, hasMention: false, hasMcp: false, hasRules: false },
      summary: `Disabled for ${ide.name || ide.id}`,
      tooltip: `🔴 Connection failed / Disabled: Component is toggled OFF for "${ide.name || ide.id}". Turn on toggle switch to connect.`,
      reason: `Component is toggled OFF for "${ide.name || ide.id}"`,
    };
  }
  ```

---

### 2.4 Cross-Milestone Frontend Alignment (`page/app.js`)

For architectural completeness across Milestone 2 and Milestone 3, the exact corresponding locations in `page/app.js` are:
1. `page/app.js:1536` (`renderPluginTable`):
   - Current: `const isEnabled = activeMap[plugin.id] !== false; // Default true`
   - Target: `const isEnabled = Boolean(activeMap && activeMap[plugin.id] === true);`
2. `page/app.js:1408` (`evaluateComponentWorkability` for IDE):
   - Current: `const isEnabled = ide.plugins ? ide.plugins[plugin.id] !== false : true;`
   - Target: `const isEnabled = Boolean(ide.plugins && ide.plugins[plugin.id] === true);`
3. `page/app.js:1454` (`evaluateComponentWorkability` for Project):
   - Current: `const isEnabled = project.plugins ? project.plugins[plugin.id] !== false : (parentIde?.plugins ? parentIde.plugins[plugin.id] !== false : true);`
   - Target: `const isEnabled = project.plugins && project.plugins[plugin.id] !== undefined ? project.plugins[plugin.id] === true : Boolean(parentIde?.plugins && parentIde.plugins[plugin.id] === true);`

---

## 3. Replacement Logic & Behavioral Invariants

### 3.1 Strict Evaluation Truth Table

| `plugins` Property State | `!== false` (Old Behavior) | `=== true` (New Behavior) | Fulfills R2? |
|---|---|---|---|
| `undefined` / `null` | `true` (Enabled) | `false` (Disabled) | ✅ Yes |
| `{}` (Empty map on initial startup) | `true` (Enabled) | `false` (Disabled) | ✅ Yes |
| `{ "alpha": true }` for `"alpha"` | `true` (Enabled) | `true` (Enabled) | ✅ Yes |
| `{ "alpha": true }` for `"beta"` | `true` (Enabled) | `false` (Disabled) | ✅ Yes |
| `{ "alpha": false }` for `"alpha"` | `false` (Disabled) | `false` (Disabled) | ✅ Yes |
| `{ "alpha": "true" }` (Non-boolean truthy) | `true` (Enabled) | `false` (Disabled) | ✅ Yes |

### 3.2 Invariant Guarantees
1. **Clean Startup Zero-Link Guarantee**:
   On initial application startup (`loadHubConfig()`) or when adding a new agent entry (`normalizeIdeEntry()`), `ide.plugins` defaults to `{}`. Running `syncAllIdes` or `syncIdePlugins` links 0 components and copies 0 rule blocks.
2. **Explicit User Intent Guarantee**:
   Components are linked **if and only if** the user explicitly selected them (`ide.plugins[plugin.id] === true`).
3. **Preference Persistence Guarantee**:
   User selections saved in `hub-config.json` (e.g. `{ "my-plugin": true }`) are restored on reload. Unselected components remain omitted from `plugins` (evaluating to `false`).
4. **Clean Severing Guarantee**:
   When a user unchecks a previously enabled component (`ide.plugins[plugin.id] = false`), `syncIdePlugins` and `syncPluginBundles` detect the difference against `loadOwnershipState(ownerKey)` and cleanly sever the symlinks, prune directories, remove MCP keys, and strip rule blocks.

---

## 4. Assessment of Existing Test Suites

A full inspection of all 12 test suites in `tests/` was conducted.

| Test File | Affected? | Root Cause | Required Action |
|---|---|---|---|
| `tests/workability-status.test.mjs` | **YES** | Test sets `plugins: {}` and asserts `res.workable === true` with green dot. Under R2, `plugins: {}` correctly yields red dot (`status: "disabled"`). | Update `activeIde` to have `plugins: { "alpha-plugin": true }` for green dot test. Add new test asserting `plugins: {}` returns red dot. |
| `tests/sync-adapters.test.mjs` | **YES** | Tests set `plugins: {}` on mock IDEs and assert that skills, MCP servers, and rules are linked. Under R2, `plugins: {}` links 0 components. | Update mock IDE objects in Tests 1–5 to explicitly provide `plugins: { "alpha-plugin": true, "beta-plugin": true }`. |
| `tests/sync-bundle.test.mjs` | **YES** | Test 1 sets `plugins: { "beta-plugin": false }` expecting `alpha-plugin` to default to true. Test 3 sets `plugins: {}` expecting `alpha-plugin` to be materialized. | Update Test 1 to `plugins: { "alpha-plugin": true, "beta-plugin": false }`. Update Test 3 to `plugins: { "alpha-plugin": true }`. Add test asserting `plugins: {}` links 0 plugins. |
| `tests/projects.test.mjs` | **NO** | Already explicitly specifies `plugins: { "alpha-plugin": true, "beta-plugin": false }` and override `{ "alpha-plugin": false, "beta-plugin": true }`. | Passes unchanged. |
| `tests/startup-modifications.test.mjs` | **NO** | Already explicitly specifies `plugins: { "alpha-plugin": true, "beta-plugin": true }`. | Passes unchanged. |
| `tests/config.test.mjs` | **NO** | Tests config serialization (`saveHubConfig` / `loadHubConfig`) and path normalization. Does not test linking. | Passes unchanged. |
| `tests/detect.test.mjs` | **NO** | Tests config path detection, executable inference, process protection, and directory sanitization. | Passes unchanged. |
| `tests/junction.test.mjs` | **NO** | Tests low-level NTFS junction creation, idempotency, retargeting, and unlinking. | Passes unchanged. |
| `tests/middleware.test.mjs` | **NO** | Tests Smart Middleware prompt matching and tool filtering. | Passes unchanged. |
| `tests/scan.test.mjs` | **NO** | Tests plugin discovery, manifest parsing, and category registry building. | Passes unchanged. |
| `tests/server.test.mjs` | **NO** | Tests REST API server endpoints (`/api/status`, `/api/agents`, `/api/plugins`, `/api/save`, CORS). | Passes unchanged. |
| `tests/ipc.test.mjs` | **NO** | Tests Magpie Host IPC surface methods. | Passes unchanged. |

---

## 5. Concrete Proposed Code Changes (Diffs)

### 5.1 `adapters.mjs` Diff

```diff
--- a/adapters.mjs
+++ b/adapters.mjs
@@ -162,3 +162,3 @@ export function collectEnabledComponents(allPlugins = [], enabledMap = {}) {
   for (const plugin of allPlugins) {
-    const isEnabled = enabledMap ? enabledMap[plugin.id] !== false : true;
+    const isEnabled = Boolean(enabledMap && enabledMap[plugin.id] === true);
     if (!isEnabled || !plugin.path || !fs.existsSync(plugin.path)) continue;
```

### 5.2 `manager.mjs` Diff

```diff
--- a/manager.mjs
+++ b/manager.mjs
@@ -1149,3 +1149,3 @@ export function syncIdePlugins(ide, allPlugins = []) {
     for (const plugin of allPlugins) {
-      const isEnabled = normalized.plugins ? normalized.plugins[plugin.id] !== false : true;
+      const isEnabled = Boolean(normalized.plugins && normalized.plugins[plugin.id] === true);
       if (isEnabled && plugin.path && fs.existsSync(plugin.path) && !plugin.isRootSkills) {
@@ -2402,4 +2402,4 @@ export function evaluateComponentAgentWorkability(plugin, ide, options = {}) {
 
-  // 3. Component toggled OFF for this specific agent
-  const isEnabled = ide.plugins ? ide.plugins[plugin.id] !== false : true;
+  // 3. Component toggled OFF / unselected for this specific agent (default is disabled/unselected)
+  const isEnabled = Boolean(ide.plugins && ide.plugins[plugin.id] === true);
   if (!isEnabled) {
```

### 5.3 `tests/workability-status.test.mjs` Diff

```diff
--- a/tests/workability-status.test.mjs
+++ b/tests/workability-status.test.mjs
@@ -26,3 +26,3 @@ test("Feature 13: Component Workability Status Dots & Quick Actions Detection",
     configPath: "C:\\Users\\test\\.claude\\skills",
     enabled: true,
-    plugins: {},
+    plugins: { "alpha-plugin": true },
   };
@@ -51,2 +51,12 @@ test("Feature 13: Component Workability Status Dots & Quick Actions Detection",
   });
+
+  await t.test("returns red dot when component is unselected/default-disabled (empty plugins map)", () => {
+    const ideWithEmptyPlugins = {
+      ...activeIde,
+      plugins: {},
+    };
+    const res = evaluateComponentAgentWorkability(samplePlugin, ideWithEmptyPlugins);
+    assert.equal(res.workable, false);
+    assert.equal(res.color, "red");
+    assert.equal(res.status, "disabled");
+  });
```

### 5.4 `tests/sync-bundle.test.mjs` Diff

```diff
--- a/tests/sync-bundle.test.mjs
+++ b/tests/sync-bundle.test.mjs
@@ -19,3 +19,3 @@ describe("Feature 3 & 6: Antigravity Bundle Sync, Unlinking & Foreign Link Prese
         configPath: agyConfig,
         enabled: true,
-        plugins: { "beta-plugin": false },
+        plugins: { "alpha-plugin": true, "beta-plugin": false },
       };
@@ -114,3 +114,3 @@ describe("Feature 3 & 6: Antigravity Bundle Sync, Unlinking & Foreign Link Prese
         configPath: agyConfig,
         enabled: true,
-        plugins: {},
+        plugins: { "alpha-plugin": true },
       };
```

### 5.5 `tests/sync-adapters.test.mjs` Diff

```diff
--- a/tests/sync-adapters.test.mjs
+++ b/tests/sync-adapters.test.mjs
@@ -27,3 +27,3 @@ describe("Feature 2 & 3: Native-Format Multi-Agent Adapters (Skills, MCP, Rules,
         configPath: path.join(sb.home, ".claude", "skills"),
         enabled: true,
-        plugins: {},
+        plugins: { "alpha-plugin": true, "beta-plugin": true },
       };
@@ -95,3 +95,3 @@ describe("Feature 2 & 3: Native-Format Multi-Agent Adapters (Skills, MCP, Rules,
         configPath: path.join(codexDir, "skills"),
         enabled: true,
-        plugins: {},
+        plugins: { "alpha-plugin": true, "beta-plugin": true },
       };
@@ -128,3 +128,3 @@ describe("Feature 2 & 3: Native-Format Multi-Agent Adapters (Skills, MCP, Rules,
         configPath: m.detectAgentConfigPath("OpenCode"),
         enabled: true,
-        plugins: {},
+        plugins: { "alpha-plugin": true, "beta-plugin": true },
       };
@@ -176,3 +176,3 @@ describe("Feature 2 & 3: Native-Format Multi-Agent Adapters (Skills, MCP, Rules,
           configPath: m.detectAgentConfigPath(agentType),
           enabled: true,
-          plugins: {},
+          plugins: { "alpha-plugin": true, "beta-plugin": true },
         };
@@ -228,3 +228,3 @@ describe("Feature 2 & 3: Native-Format Multi-Agent Adapters (Skills, MCP, Rules,
         enabled: true,
-        plugins: {},
+        plugins: { "alpha-plugin": true, "beta-plugin": true },
       };
```

---

## 6. Verification and Execution Steps

When Milestone 2 implementation begins:
1. Apply the edits to `adapters.mjs:165`, `manager.mjs:1151`, and `manager.mjs:2404`.
2. Apply the test updates to `tests/workability-status.test.mjs`, `tests/sync-bundle.test.mjs`, and `tests/sync-adapters.test.mjs`.
3. Run `rtk npm test`.
4. Verify:
   - All 10 existing test suites pass with 0 failures (42 passing tests).
   - `plugins: {}` links 0 components and renders red dots.
   - `plugins: { [id]: true }` links only the enabled component and renders green dots.
