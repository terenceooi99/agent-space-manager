---
trigger: always_on
description: "Cross-agent MCP schema compatibility invariants: root key normalization, OpenCode schema transformation, TOML serialization, and user config preservation"
---

# Safety Invariant 4: Cross-Agent MCP Schema Compatibility & Key Normalization

## Core Avoidance Mechanism
Eliminate tool registration failures, schema validation exceptions, and configuration clobbering across heterogeneous AI coding agents by normalizing Model Context Protocol (MCP) root keys, transforming command arguments to agent-specific schemas, safely quoting TOML tables, and preserving user-defined MCP servers.

---

## 1. Root Key Compatibility Invariant
Supported AI coding agents expect distinct root keys in their native JSON configuration files. Writing an incompatible root key causes the agent to either silently ignore the configuration or throw a fatal schema validation exception.

| Agent / Environment | Target File Location | Required Root Key | Format |
|---|---|---|---|
| **VS Code / GitHub Copilot** | `Code/User/mcp.json`, `.vscode/mcp.json` | **`servers`** *(NOT `mcpServers`)* | JSON |
| **Claude Desktop** | `%APPDATA%\Claude\claude_desktop_config.json` | `mcpServers` | JSON |
| **Claude Code** | Global: `~/.claude.json`, Project: `.mcp.json` | `mcpServers` | JSON |
| **Cursor AI** | `~/.cursor/mcp.json`, `.cursor/mcp.json` | `mcpServers` | JSON |
| **Windsurf** | `~/.codeium/windsurf/mcp_config.json` | `mcpServers` | JSON |
| **Antigravity** | `~/.gemini/config/mcp_config.json`, `.agents/mcp_config.json` | `mcpServers` | JSON |
| **Gemini CLI** | `~/.gemini/settings.json`, `.gemini/settings.json` | `mcpServers` | JSON |
| **Cline & Roo Code** | `Code/User/globalStorage/.../settings/` | `mcpServers` | JSON |
| **Kiro (AWS)** | `~/.kiro/settings/mcp.json` | `mcpServers` | JSON |
| **OpenCode** | Global: `~/.config/opencode/opencode.json`, Project: `opencode.json` | **`mcp`** | OpenCode JSON |
| **Codex CLI** | Global: `~/.codex/config.toml`, Project: `.codex/config.toml` | **`[mcp_servers.<name>]`** | TOML Table |

### Critical Failure Mode (VS Code Copilot):
- If an adapter writes the standard `"mcpServers"` root key into VS Code's `mcp.json`, GitHub Copilot **silently ignores all MCP servers**.
- *Rule Guard (`adapters.mjs:686`)*:
  ```javascript
  const rootKey = mcpSpec.key || "mcpServers"; // "servers" for vscode-copilot
  ```

---

## 2. OpenCode Schema Transformation Invariant
OpenCode validates its configuration using strict Effect Schema definitions. Passing standard MCP definitions causes validation rejection and crashes the OpenCode daemon:

- **Command Format**: OpenCode requires a single string array combining the executable command and all arguments under `"command"` (e.g. `["npx", "-y", "@modelcontextprotocol/server-alpha"]`).
- **Environment Key**: OpenCode requires the property name `"environment"` rather than standard `"env"`.
- **Type Discrimination**: Every entry must include `"type": "local"` (or `"type": "remote"` for URLs) and `"enabled": true`.

### Transformation Implementation (`adapters.mjs:655-677`):
```javascript
export function toOpenCodeMcpEntry(def) {
  if (!def || typeof def !== "object") return null;

  // Remote MCP endpoint
  const remoteUrl = def.url || def.serverUrl || def.httpUrl;
  if (remoteUrl) {
    return { type: "remote", url: remoteUrl, enabled: true };
  }

  // Local command MCP
  const cmd = def.command
    ? [def.command, ...(Array.isArray(def.args) ? def.args : [])]
    : [];
  if (cmd.length === 0) return null;

  const entry = { type: "local", command: cmd, enabled: true };
  if (def.env && Object.keys(def.env).length > 0) {
    entry.environment = { ...def.env };
  }
  return entry;
}
```

---

## 3. Null / Empty Command Guard
If an MCP definition lacks both a valid executable `command` and a remote URL, it must **NOT** be written to disk. Never emit stub entries with `command: []` or `command: undefined`.

---

## 4. Codex CLI TOML Block Invariant
Codex CLI stores MCP servers inside `~/.codex/config.toml` or `.codex/config.toml`.

- Managed MCP servers must be serialized strictly within managed boundary comments:
  ```toml
  # >>> agent-space-manager
  [mcp_servers.alpha-mcp]
  command = "npx"
  args = ["-y", "@alpha/mcp-server"]

  [mcp_servers."beta-db"]
  command = "uvx"
  args = ["mcp-sqlite", "--db", "test.db"]
  # <<< agent-space-manager
  ```
- **Quoted Table Keys**: Any server name containing non-alphanumeric characters (dots, hyphens, spaces) must be quoted to prevent TOML parsing panics (`adapters.mjs:802`).
- User settings outside the block (e.g., `model = "gpt-5-codex"`) must never be modified or removed.

---

## 5. Non-Destructive Merging & Atomic Backup Invariant
1. **Pristine State Backup**: Always create an atomic `.asm-bak` copy before modifying any user MCP configuration file.
2. **Preserve User Servers**: Merge managed servers into the existing configuration document.
3. **Selective Removal**: On component deactivation, only remove keys tracked in the agent's ownership manifest (`.asm-state/<ownerId>.json`). User-defined MCP servers are never touched.
