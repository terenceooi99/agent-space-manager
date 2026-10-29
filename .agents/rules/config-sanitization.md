---
trigger: always_on
description: "Configuration and schema sanitization invariants: preventing Language Server crashes by eliminating 0-byte JSON files, empty object stubs, and orphaned ghost directories"
---

# Safety Invariant 2: Configuration & Schema Sanitization

## Core Avoidance Mechanism
Prevent language server crash loops, JSON parser aborts, schema validation panics, and configuration corruption by enforcing clean configuration sanitization, strict identity validation, automated stub pruning, and atomic `.asm-bak` backups across all agent configuration directories.

---

## 1. Zero 0-Byte or Empty `{}` Stub Files
- **Strict Prohibition**: NEVER write blank JSON objects `{}` or 0-byte stub files into agent configuration directories (`projects/`, `workspaces/`, `plugins/`, `skills/`, or settings folders).
- **Failure Impact Across AI Agents**:
  - **Antigravity Project Scanner (`~/.gemini/config/projects/`)**: When Antigravity discovers workspace and project manifests, a 0-byte `.json` file triggers `SyntaxError: Unexpected end of JSON input` in its Node/Electron loader or `unexpected EOF` in its Go backend. This crashes the project manifest manager, halting multi-project indexing across the workspace.
  - **Missing Identity Property Panics**: When encountering an empty `{}` JSON stub missing mandatory identifiers, manifest loaders crash with `TypeError: Cannot read properties of undefined (reading 'id')` or fail schema validation.
  - **Claude Code CLI (`~/.claude.json`)**: If `~/.claude.json` is corrupted, truncated, or left empty after an interrupted write, the `claude` CLI fails to boot with unhandled JSON parse exceptions, breaking terminal agent interactions.
  - **OpenCode Schema Validation (`opencode.json`)**: OpenCode parses configuration using strict Effect Schema definitions. An invalid or empty JSON stub causes the schema parser to reject the configuration and crash the supervisor.
  - **Language Server Restart Thrashing**: Empty ghost directories left behind after unlinking plugins or skills trigger recursive file watchers in Language Server Protocol (LSP) daemons, producing continuous warnings and CPU thrashing.

---

## 2. Mandatory Required Identity Fields
Before serializing any project manifest, agent profile, or workspace descriptor to disk, verify that all mandatory identity fields exist, are non-empty strings, and conform to schema expectations:
- `"id"`: Unique non-empty string identifier (e.g., `"my-project-1"`, `"antigravity"`).
- `"name"`: Human-readable display label.

If a manifest lacks the `"id"` property, abort serialization immediately or prune the invalid file. Never allow invalid manifests to touch disk.

---

## 3. Automated Directory Sanitization (`sanitizeAgentConfigDirectory`)
Agent Space Manager proactively sanitizes agent configuration directories before and after any synchronization or detection operation.

### Sanitization Implementation (`manager.mjs:1074-1120`):
```javascript
export function sanitizeAgentConfigDirectory(configDir, agentType = "general") {
  if (!configDir || !fs.existsSync(configDir)) return;
  try {
    // 1. Sanitize projects / workspace manifests
    const projDir = path.join(configDir, "projects");
    if (fs.existsSync(projDir)) {
      for (const ent of fs.readdirSync(projDir)) {
        if (!ent.endsWith(".json")) continue;
        const p = path.join(projDir, ent);
        try {
          const st = fs.statSync(p);
          // Prune 0-byte files
          if (st.size === 0) {
            fs.unlinkSync(p);
            continue;
          }
          const content = fs.readFileSync(p, "utf8").trim();
          // Prune empty object stubs and empty whitespace files
          if (content === "{}" || content === "") {
            fs.unlinkSync(p);
            continue;
          }
          // Validate JSON structure and required id field
          const parsed = JSON.parse(content);
          if (parsed && typeof parsed === "object" && !parsed.id) {
            fs.unlinkSync(p);
          }
        } catch {
          // Unparseable / corrupted JSON files are pruned
          try { fs.unlinkSync(p); } catch {}
        }
      }
    }

    // 2. Sanitize empty ghost directories left behind in plugins / skills
    for (const sub of ["plugins", "skills"]) {
      const subDir = path.join(configDir, sub);
      if (fs.existsSync(subDir)) {
        for (const ent of fs.readdirSync(subDir)) {
          const itemPath = path.join(subDir, ent);
          try {
            const st = fs.lstatSync(itemPath);
            if (st.isDirectory() && fs.readdirSync(itemPath).length === 0) {
              fs.rmSync(itemPath, { recursive: true, force: true });
            }
          } catch {}
        }
      }
    }
  } catch {}
}
```

---

## 4. Atomic Writes & `.asm-bak` Backups
To protect user configuration files against power interruptions, process crashes, or schema corruption:

1. **Pre-Modification Backup Invariant**:
   - Before modifying any pre-existing user configuration file (`~/.claude.json`, `~/.codex/config.toml`, `opencode.json`, `mcp.json`, `CLAUDE.md`, `AGENTS.md`), create an atomic backup:
     ```javascript
     export function ensureBackupOnce(filePath) {
       if (fs.existsSync(filePath)) {
         const bak = `${filePath}.asm-bak`;
         if (!fs.existsSync(bak)) {
           fs.copyFileSync(filePath, bak);
         }
       }
     }
     ```
2. **Preserve User Original Copy**:
   - Never overwrite an existing `.asm-bak` file. The `.asm-bak` backup must strictly represent the user's original, untouched configuration prior to any Agent Space Manager modifications.
3. **Atomic File Replacement**:
   - Write file contents completely using synchronous flushes or atomic temp-file renames (`fs.writeFileSync(tempPath, ...)` followed by `fs.renameSync(tempPath, destPath)`).
   - Never perform in-place chunked writes that leave 0-byte windows on disk.
