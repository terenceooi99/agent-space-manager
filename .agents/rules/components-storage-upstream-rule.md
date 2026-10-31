---
trigger: always_on
description: "Enforces standard plugin layout, mandatory upstream source links, and centralized weekly Monday update checks whenever adding or editing components in Components Storage Path."
---

# Invariant: Components Storage Layout, Upstream Links & Centralized Updates

This rule governs all autonomous additions (`addendum`), creations, edits, refactors, and updates made to any component (plugins, skills, MCP servers, rules, hooks, and agents) within the Components Storage Path (e.g. `D:\Software\AI Agent Space` or configured `hubRoot`).

---

## 1. Trigger Conditions
This rule applies **ALWAYS** and is specifically enforced whenever:
- Adding a new component, skill, plugin, MCP server, rule, or subagent to Components Storage Path.
- Editing, modifying, or refactoring an existing component in Components Storage Path.
- Migrating or organizing files in Components Storage Path.

---

## 2. Standard Plugin Directory Structure
Every component stored in the Components Storage Path MUST adhere to the standard plugin specification:

```
plugins/<plugin-name>/
├── plugin.json       # Required marker & manifest (must include "upstream" source URL)
├── mcp_config.json   # Optional MCP server definitions
├── hooks.json        # Optional hooks definition
├── skills/           # Optional skills directory
│   └── <upstream GitHub name/self (if self created)-skill-name>/
│       └── SKILL.md  # Must include upstream: <url> in YAML frontmatter
├── agents/           # Optional subagent definition templates
│   └── <upstream GitHub name/self (if self created)-agent-name>.md  # Must include upstream in frontmatter
└── rules/            # Optional rules directory
    └── <upstream GitHub name/self (if self created)-rule-name>.md    # Must include upstream in frontmatter
```

---

## 3. Mandatory Upstream Links
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

## 4. Prohibition of Decentralized Component Updaters
- **Strict Prohibition**: NEVER create local, decentralized update checking scripts (such as `update_checker.mjs` or `update_check_state.json`) inside component folders or shared directories.
- **Centralized Update Checking**: All update checks for components installed in Components Storage Path are strictly centralized within the Agent Space Manager plugin.
- **Weekly Schedule**: Centralized update checks execute **once per week**, on the first day starting on **Monday** whenever the user starts up Magpie.
- If legacy decentralized update scripts or state files are encountered during addendum or edits, immediately remove them.

