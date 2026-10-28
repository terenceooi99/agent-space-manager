# Smart Middleware & Agent Space Manager

**Universal Multi-IDE & Project Skill Orchestrator with Dynamic Intent-Based Tool Gateway for [Magpie](https://usemagpie.ai)**.

---

## Core Purpose & Why This Exists

As developers adopt multiple AI coding environments (Antigravity, Cursor, Windsurf, Claude Code, OpenCode, VS Code Copilot), skills, rules, and MCP servers become fractured across different IDE-specific directories. Managing, updating, and syncing these tools across dozens of project repositories and tools quickly becomes unmaintainable.

**Agent Space Manager solves this by acting as a single, centralized control plane for your entire AI development ecosystem:**

1. **Single Source of Truth (Central Hub)**: Store all your plugins, skills, MCP configs, hooks, agents, and rules in one centralized directory (the Components Storage Path / Hub Root). No duplicate installations across different IDE folders.
2. **Dynamic Cross-IDE Distribution**: Automatically establishes non-destructive OS directory links (NTFS junctions on Windows, symlinks on macOS/Linux) directly into each IDE's native discovery path (e.g., `~/.gemini/config/plugins`, `~/.cursor/skills`, `~/.claude/skills`).
3. **Instant IDE Sync & Auto-Unlinking**:
   - Switching the storage path immediately repoints all connected IDEs to the new location.
   - Setting a path with 0 components automatically severs all links, cleanly removing them from connected IDEs.
   - Deactivating a component unlinks it instantly without deleting the original source code.
4. **Granular Project & Workspace Overrides**: Enable only the skills and MCP servers relevant to a specific repository while maintaining clean global defaults for everything else.
5. **Smart Middleware Tool Gateway**: Prevents LLM context blowout and API `400` errors (such as exceeding model-specific limits like 128 tools in Claude/GPT models) by dynamically prioritizing and filtering active tool schemas per turn.

---

## Key Capabilities

- **Zero-Hardcoded Multi-Platform Support**: Works seamlessly across Windows, macOS, and Linux without hardcoding user home paths or drive letters.
- **Dynamic Configuration Link Discovery**: Automatically inspects filesystem probes, environment variables (`$AGENT_TOOLS_ROOT`, `$AI_WORKSPACE_DIR`), and IDE CLI tools (`opencode debug paths`, etc.) to accurately detect plugin and skill link directories.
- **Granular Multi-IDE & Project Control**: Toggle skills, MCP servers, and rules on or off per IDE and per project repository. Unregistered projects automatically inherit global platform defaults.
- **Safe Junction Lifecycle**: Linking creates safe NTFS directory junctions / symlinks; removing an IDE or project cleanly severs links without touching source plugins in `plugins/`.
- **Gateway Model Limit Protection**: Dynamically optimizes tool schemas per conversation turn (default: 96 max) to prevent API 400 errors from exceeding model tool limits (such as the 128 tools limit in GPT-4 / GPT-5 / Claude), with a 1-click toggle directly in the UI.

---

## Architecture & Data Flow

```text
[ Magpie Host (Bun / WebView2) ]
        │
        ├── IPC: globalThis.magpie.api (getPlugins, saveConfig, etc.)
        └── HTTP / REST Fallback: http://127.0.0.1:41789/api/* (server.mjs)
                    │
                    ▼
        [ manager.mjs Engine ]
        ├── scanPlugins(hubRoot)
        ├── buildCategoriesRegistry(plugins, hubRoot)
        └── syncIdePlugins(ide, allPlugins) ──> Creates/Removes Junctions
```

1. **Host Entrypoint (`index.mjs`)**: Mounts the plugin into Magpie runtime and exposes the IPC API methods. Also starts `server.mjs`.
2. **Core Engine (`manager.mjs`)**:
   - `scanPlugins(hubRoot)`: Scans for plugins under `<hubRoot>/plugins` or directly in `<hubRoot>` if plugin folders are at root.
   - `syncIdePlugins(ide, allPlugins)`: Compares existing junction points in `ide.configPath` with active plugin list. Removes obsolete/disabled junctions and links active ones.
3. **Web UI (`page/index.html`, `page/app.js`, `page/style.css`)**:
   - Running in WebView2, queries `apiClient.getPlugins(targetPath)`.
   - Renders IDE list, Project overrides, Plugin tables, and Discovered Components category browser.
   - Debounced auto-save & sync on any path/toggle change (`triggerAutoSync()` -> `persistConfig()`).

---

## Supported IDEs & Auto-Detection Matrix

| Agent Client / IDE | Detected Configuration Link Directory |
| :--- | :--- |
| **OpenCode** | `<home>/.config/opencode/plugins` |
| **Google Antigravity / Gemini CLI** | `<home>/.gemini/config/plugins` |
| **Cursor AI** | `<home>/.cursor/skills` |
| **Windsurf** | `<home>/.windsurf/skills` |
| **Claude Code (Anthropic)** | `<home>/.claude/skills` |
| **Roo Code / Cline** | `<appdata>/Code/User/globalStorage/rooveterinaryinc.roo-cline/skills` |
| **VS Code Copilot** | `<home>/.vscode/skills` |
| **Custom / Unknown Agent** | `<home>/.<agent-name>/plugins` (probed from binary or name) |

---

## Known Critical Issues & AI Handover Guide

> [!WARNING]
> **Active Problem**: When the user changes **Components Storage Path** to a non-existent, invalid, or misspelled directory (e.g., `D:\Software\AI Agnt Space`), the UI still continues to show discovered components, and/or fails to automatically unlink them from Antigravity/connected IDEs.

### Expected Behavior
1. **Valid Path (e.g. `E:\Software\AI Agent Space`)**: Discovers all components in `E:\...`, displays them in the UI, and points junctions in connected IDEs (such as `~/.gemini/config/plugins`) to `E:\...`.
2. **Invalid / Empty Path (e.g. `D:\Software\AI Agnt Space` or non-existent folder)**:
   - Must discover **0** components.
   - UI metrics and tables must display 0 / empty state immediately.
   - **Crucial**: All linked components in the connected IDE (e.g. `~/.gemini/config/plugins`, `skills`, `skills.json`) must be unlinked/removed automatically so the IDE has zero components visible.
3. **Deactivated Component**: Toggling off a component in the UI must immediately unlink and remove that component's junction from the connected IDE.

---

### Technical Breakdown of Where to Inspect

#### 1. UI Data Fetching & Cache Leakage (`page/app.js`)
* **File**: `page/app.js` -> `apiClient.getPlugins(path)`
* **Issue**:
  - `page/app.js` has multiple fallback layers:
    1. `magpieApi.getPlugins(targetPath)` (IPC bridge)
    2. `fetch(http://127.0.0.1:41789/api/plugins?path=...)` (REST server)
    3. `globalThis.__PLUGINS_CACHE__` (injected script `page/plugins-cache.js`)
    4. `page/plugins-cache.json`
    5. `localStorage`
  - If Magpie runs in WebView2 and local `fetch` fails, or if `magpieApi.getPlugins` returns `[]`, any loose fallback check (like missing exact path match against `__PLUGINS_CACHE__.path`) causes stale components from `D:\Software\AI Agent Space` to be returned.
  - Check `reloadPluginsFromHub()` and `computeEffectiveHubPath()`: Ensure `hubConfig.hubRoot` does not fall back to `DEFAULT_HUB_ROOT` when an explicit path was typed by the user, even if that path does not exist.

#### 2. Backend Scanning & Default Fallback (`manager.mjs`)
* **File**: `manager.mjs` -> `scanPlugins(hubRoot)`
* **Issue**:
  - If `hubRoot` does not exist (`fs.existsSync(hubRoot) === false`), it must return `[]` immediately without falling back to `DEFAULT_HUB_ROOT`.
  - Check `getEffectiveHubRoot(configOrPath)`:
    ```javascript
    export function getEffectiveHubRoot(configOrPath) {
      if (typeof configOrPath === "object" && configOrPath.hubRoot && configOrPath.hubRoot.trim() !== "") {
        return configOrPath.hubRoot.trim(); // Do not fall back to DEFAULT_HUB_ROOT if set!
      }
      // ...
    }
    ```

#### 3. IDE Junction Clean-up & Antigravity Ghost Skills (`manager.mjs`)
* **File**: `manager.mjs` -> `syncIdePlugins(ide, allPlugins)`
* **Issue**:
  - For Antigravity (`~/.gemini/config/`), components are loaded from two places:
    1. `~/.gemini/config/plugins/*` (Junctions managed by `syncIdePlugins`)
    2. `~/.gemini/config/skills.json` and `~/.gemini/config/skills` junction.
  - If `allPlugins` is empty (`[]`):
    - All junctions in `~/.gemini/config/plugins` must be deleted (`removeJunction`).
    - `~/.gemini/config/skills.json` must be emptied (`{"entries":[]}`) or deleted.
    - `~/.gemini/config/skills` junction must be removed.
  - Otherwise, Antigravity keeps loading stale skills from the old `skills.json` regardless of what happens in `plugins/`.

---

## Standard Plugin Format

All components inside your Hub root adhere to the standardized self-contained plugin specification:

```text
plugins/<plugin-name>/
├── plugin.json       # Required manifest (name, version, description)
├── mcp_config.json   # Optional MCP server definitions
├── hooks.json        # Optional hooks definition
├── skills/           # Optional skills (<skill-name>/SKILL.md)
├── agents/           # Optional subagent templates (<agent-name>.md)
└── rules/            # Optional prompt rules (<rule-name>.md)
```

---

## License

MIT © Terence Ooi Teng Wei
