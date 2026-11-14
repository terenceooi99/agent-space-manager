---
trigger: always_on
description: "Enforces standard plugin layout, mandatory upstream source links, centralized weekly Monday update checks, and complete component cleanup on plugin removal whenever adding, editing, or removing components in Components Storage Path."
---

# Invariant: Components Storage Layout, Upstream Links, Centralized Updates & Removal Cleanup

This rule governs all autonomous additions (`addendum`), creations, edits, refactors, removals, and updates made to any component (plugins, skills, MCP servers, rules, hooks, and agents) within the Components Storage Path (e.g. `D:\Software\AI Agent Space` or configured `hubRoot`).

---

## 1. Trigger Conditions
This rule applies **ALWAYS** and is specifically enforced whenever:
- Adding a new component, skill, plugin, MCP server, rule, or subagent to Components Storage Path.
- Editing, modifying, or refactoring an existing component in Components Storage Path.
- Removing, deleting, or uninstalling a plugin or component from Components Storage Path.
- Migrating or organizing files in Components Storage Path.

---

## 2. Standard Directory & Plugin Structure
Every component stored in the Components Storage Path MUST adhere to the standard specification, which houses plugins, optional standalone skills, hub metadata, and a shared cross-agent communication/data directory:

```
<Components Storage Path>/
├── plugins/          # Standard plugin directory
│   └── <plugin-name>/
│       ├── plugin.json       # Required marker & manifest (must include "upstream" source URL)
│       ├── mcp_config.json   # Optional MCP server definitions
│       ├── hooks.json        # Optional hooks definition
│       ├── skills/           # Optional skills directory
│       │   └── <upstream GitHub name/self (if self created)-skill-name>/
│       │       └── SKILL.md  # Must include upstream: <url> in YAML frontmatter
│       ├── agents/           # Optional subagent definition templates
│       │   └── <upstream GitHub name/self (if self created)-agent-name>.md  # Must include upstream in frontmatter
│       └── rules/            # Optional rules directory
│           └── <upstream GitHub name/self (if self created)-rule-name>.md    # Must include upstream in frontmatter
├── shared/           # Cross-agent IPC, discovery registry, handoff, and shared tools directory
│   ├── agent-connectors.json # Cross-agent messaging and discovery registry (active IDE agents & capabilities)
│   ├── handoff/              # Cross-agent delegation and task handoff inboxes
│   │   └── <agent-id>/       # Target agent inbox queue
│   ├── _upstream_backups/    # Pre-update backups and component snapshots
│   ├── middleware-intents.json # Dynamic user & agent Smart Middleware intent keyword registry
│   └── <shared-tool-dirs>/   # Shared runtime states, engines, caches, or browser automation; named after joining skills (e.g. stagehand-fastcrw)
├── skills/           # Standalone or migrated skills
├── hub-config.json   # Hub configuration
├── plugins.json      # Discovered/registered plugins index
└── skills.json       # Discovered/registered skills index
```

---

## 3. Shared Directory Specification (`shared/`)
The `<Components Storage Path>/shared` folder serves as the centralized cross-agent IPC, discovery, and shared coordination layer across all supported AI coding agents (Antigravity, Cursor, Windsurf, Claude Code, OpenCode, VS Code Copilot, etc.):
1. **`agent-connectors.json`**: Global registry tracking connected agent profiles, capability flags, root config paths, and communication bridges.
2. **`handoff/`**: Inter-agent handoff queues. Enables asynchronous task delegation and context packet transfers between agents across different IDEs.
3. **`_upstream_backups/`**: Centralized safety backups created prior to weekly upstream component updates or synchronization runs.
4. **`middleware-intents.json`**: Dynamic user and agent Smart Middleware intent keyword registry. Maps tool patterns to user intent keywords so the tool gateway prioritizes domain tools without exceeding context limits.
5. **Shared Tooling & Skill-Naming Convention**: Shared runtime caches, browser automation tools, and routing engines accessible universally across all connected agents without redundant duplication. Any subfolder created in `shared/` for joint or multi-skill tooling **MUST be named after the joining skills** (e.g. `stagehand-fastcrw` representing the joined capability of `stagehand` and `fastcrw`, `omniroute`).
6. **Preservation Invariant**: NEVER treat the `shared/` directory or its internal files as loose components, and never delete or clear user-managed handoffs, shared configs, or `middleware-intents.json` during plugin cleanup.

---

## 4. Mandatory Upstream Links
Whenever saving, installing, or modifying components:
1. **Plugins (`plugins/<plugin-name>/plugin.json`)**:
   Must include an `"upstream"` property containing the official GitHub repository URL, package URL, or source link where the plugin originated:
   ```json
   {
     "name": "plugin-name",
     "version": "1.0.0",
     "description": "...",
     "upstream": "https://github.com/owner/repository"
   }
   ```
2. **Skills (`skills/<skill-name>/SKILL.md`)**:
   Must include `upstream: "https://github.com/owner/repository"` in YAML frontmatter.
3. **Rules (`rules/<rule-name>.md`)**:
   Must include `upstream: "https://github.com/owner/repository"` in YAML frontmatter.
4. **Agents (`agents/<agent-name>.md`)**:
   Must include `upstream: "https://github.com/owner/repository"` in YAML frontmatter.

---

## 4. Complete Plugin Removal & Cleanup
When the user requests removing, deleting, or uninstalling a plugin:
- **Clean All Associated Components**: All components related to the target plugin MUST also be removed concurrently, leaving no orphaned artifacts:
  1. The plugin directory itself (`plugins/<plugin-name>/`).
  2. All nested skills in `plugins/<plugin-name>/skills/` and any corresponding bridged links in connected agents.
  3. All subagent definitions in `plugins/<plugin-name>/agents/` and bridged definitions.
  4. All rules in `plugins/<plugin-name>/rules/` and bridged rule files or managed rule comment sections.
  5. All MCP servers declared in `plugins/<plugin-name>/mcp_config.json` from agent configurations.
  6. All hooks declared in `plugins/<plugin-name>/hooks.json` from agent configurations.
  7. All Smart Middleware intent entries in `<Components Storage Path>/shared/middleware-intents.json`: trim and remove the target plugin's intent keywords and tool patterns so no dead or stale intent mappings remain.
- Ensure that no dangling symlinks/junctions, orphaned directories, ghost config entries, or leftover intent keywords remain in Components Storage or connected agents.

---

## 5. Prohibition of Decentralized Component Updaters
- **Strict Prohibition**: NEVER create local, decentralized update checking scripts (such as `update_checker.mjs` or `update_check_state.json`) inside component folders or shared directories.
- **Centralized Update Checking**: All update checks for components installed in Components Storage Path are strictly centralized within the Agent Space Manager plugin.
- **Weekly Schedule**: Centralized update checks execute **once per week**, on the first day starting on **Monday** whenever the user starts up Magpie.
- If legacy decentralized update scripts or state files are encountered during addendum, edits, or removals, immediately remove them.

---

## 6. Mandatory File Encoding: Strict UTF-8 Without BOM (No BOM)
- **Strict Invariant**: ALL manifest and configuration files (`plugin.json`, `mcp_config.json`, `hooks.json`, `SKILL.md`, `*.md`) MUST be saved strictly in standard **UTF-8 without Byte Order Mark (UTF-8 No BOM)**.
- **Prohibition on UTF-8 BOM**: NEVER write files with a UTF-8 BOM (`\uFEFF` / byte sequence `0xEF, 0xBB, 0xBF`). Standard JSON parsers across Node.js, Electron, Go, Python, and AI IDE engines reject strings starting with `\uFEFF`, causing `"Invalid plugin.json"` errors and manifest load failures.
- **Windows PowerShell Prevention**: On Windows PowerShell (5.1), default `Set-Content` and `Out-File` write UTF-8 with BOM by default. Always write files without BOM using Node.js `fs.writeFileSync(file, text, "utf8")`, PowerShell 7 `-Encoding utf8NoBOM`, or `[System.IO.File]::WriteAllText($path, $content, (New-Object System.Text.UTF8Encoding($false)))`.

---

## 7. One-Time Rearrangement Stability
- **Preserve Existing Structure**: If the rearrangement of the file structure in Components Storage Path has already been executed once using the prompt, the agent must **STOP** rearranging, moving, or reorganizing existing directory/file structures on subsequent runs.
- **Explicit Request Exception**: Further restructuring of existing folders or components is strictly forbidden unless the user explicitly and specifically requests a file structure rearrangement.
- **Component Addendum Safety**: New components added afterwards must follow the standard specification without modifying or shifting previously organized components.

---

## 8. Dynamic Smart Middleware Intent Lifecycle (`shared/middleware-intents.json`)
- **Initial Run Seeding**: On the initial run of the prompt (or whenever `<Components Storage Path>/shared/middleware-intents.json` is missing or does not yet include all currently installed components), inspect all existing plugins in `plugins/` (and their `plugin.json`, `mcp_config.json`, and skill definitions), identify their tool names and capabilities, and generate the initial `shared/middleware-intents.json` personal layer mapping each existing tool to relevant intent keywords and tool patterns.
- **Intent Registration Invariant**: Whenever adding, creating, or modifying a component providing MCP tools or capabilities, register or update its intent keywords and tool patterns in `<Components Storage Path>/shared/middleware-intents.json`.
- **Uninstallation Trimming**: Whenever removing or uninstalling any plugin/component, trim and delete its corresponding intent entries from `shared/middleware-intents.json` so no dead or stale tool mappings remain.
- **Format**:
  ```json
  {
    "<component-or-category>": {
      "toolPatterns": ["<tool_prefix>", "<tool_name>"],
      "intentKeywords": ["<keyword1>", "<keyword2>"]
    }
  }
  ```
- **Rationale**: Keeps the Smart Middleware dynamically optimized and personalized for the user's workflow without modifying the core engine code in `smart-tools.middleware.js`, allowing the core middleware to cleanly receive upstream updates from origin without wiping user settings.

