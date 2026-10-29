---
trigger: always_on
description: "Rule normalization and metadata trigger invariants: mandatory YAML frontmatter, Cortex trigger specification, and delimiter-bounded inline rules"
---

# Safety Invariant 3: Rule Normalization, Metadata Triggers & Syntax Guards

## Core Avoidance Mechanism
Prevent rule indexing daemon crashes, memory catalog corruption, and parser exceptions across heterogeneous AI agents by normalizing markdown rule frontmatter, enforcing mandatory `trigger: always_on` defaults, sanitizing descriptions, and isolating hub rules within managed delimiter blocks.

---

## 1. Mandatory Frontmatter for Metadata-Driven Agents
Any rule file synchronized to metadata-driven agents (such as Google Antigravity's Cortex memory engine or Cursor) MUST include valid YAML frontmatter at the very top of the file:
```yaml
---
trigger: always_on
description: "Descriptive summary of the rule"
---
```

### Boundary & Formatting Invariants:
- The opening `---` must begin on the very first character of line 1 (no leading whitespace, byte-order marks, or comments).
- The frontmatter must close with `---` on a line by itself before markdown body content begins.
- Frontmatter values must be well-formed YAML.

---

## 2. Preventing `CORTEX_MEMORY_TRIGGER_UNSPECIFIED` in Antigravity
- **Root Cause**: The Google Antigravity Cortex memory engine ingests markdown rule files located in `~/.gemini/config/rules/` and project `.agents/rules/`. If a rule lacks YAML frontmatter or omits the `trigger:` property, the Cortex parser throws an uncaught fatal exception:
  ```
  CORTEX_MEMORY_TRIGGER_UNSPECIFIED
  ```
  This exception halts rule indexing, corrupts the agent's memory catalog, and causes the rule indexing supervisor to enter an unrecoverable restart loop.
- **Automated Syntax Guard**:
  When synchronizing rules or skills, the adapter must inspect parsed frontmatter. If `trigger` is omitted, null, or empty, default strictly to `trigger: always_on`:
  ```javascript
  const trigger = frontmatter.trigger || "always_on";
  ```
- **Recognized Cortex Triggers**:
  - `always_on`: Always loaded into active agent context.
  - `user_prompt`: Triggered dynamically based on semantic similarity to user prompt.
  - `agent_eval`: Triggered during agent self-evaluation phases.
  - `periodic_trigger`: Evaluated on cron or periodic schedules.

---

## 3. Description Sanitization & YAML Safety
Rule descriptions must be clean, single-line strings. Multiline descriptions inside unquoted YAML blocks break YAML parsers and cause syntax exceptions:
- **Sanitization Strategy (`adapters.mjs:940-955`)**:
  ```javascript
  const desc = (frontmatter.description || `Rule ${path.basename(destResolved, suffix)}`)
    .replace(/\r?\n/g, " ")
    .trim();
  ```
- Serialize using `JSON.stringify(desc)` so special characters (colons, double quotes, escape sequences) remain syntactically valid YAML strings:
  ```javascript
  const header = `---\ndescription: ${JSON.stringify(desc)}\ntrigger: ${trigger}\n---\n\n`;
  ```

---

## 4. Multi-Agent Rule Format Adaptations
Rules authored in Agent Space Manager are transformed into each target agent's native storage format:

| Target Agent | Rule Location | Rule Format | Transformation Strategy |
|---|---|---|---|
| **Antigravity** | `~/.gemini/config/rules/*.md` | `antigravity-rule` | Frontmatter with `trigger: always_on` and `description` |
| **Cursor AI** | `.cursor/rules/*.mdc` | `cursor-rule` (`.mdc`) | Frontmatter with `description`, `globs: *`, `alwaysApply: true` |
| **Windsurf** | `memories/global_rules.md` | `inline-block` | Delimited markdown comment block |
| **Claude Code** | `~/.claude/CLAUDE.md` | `import-block` | Delimited markdown block `<!-- agent-space-manager:start -->` |
| **Codex CLI** | `~/.codex/AGENTS.md` | `inline-block` | Delimited markdown comment block |
| **OpenCode** | `~/.config/opencode/AGENTS.md` | `inline-block` | Delimited markdown comment block |

---

## 5. OpenCode Subagent Normalization
When synchronizing subagents to OpenCode (`.opencode/agents/*.md`), OpenCode's Effect Schema requires a `mode` field:
```javascript
// adapters.mjs:922-937
if (ext === ".md" && destResolved.includes(path.join(".opencode", "agents"))) {
  const parsed = parseMarkdownFrontmatter(content);
  const frontmatter = parsed.frontmatter || {};
  frontmatter.mode = frontmatter.mode || "subagent";
  // Re-serialize frontmatter with mode: subagent
}
```
This ensures subagents comply with OpenCode's agent schema without throwing validation errors.

---

## 6. Delimited Block Isolation Invariant
For agents using monolithic rule files (`CLAUDE.md`, `AGENTS.md`, `global_rules.md`), **NEVER** overwrite the entire file. Enclose managed rules strictly within unique boundary markers:

### Markdown Delimiters:
```markdown
<!-- agent-space-manager:start -->
# Synced Rules (Agent Space Manager)
... managed rule content ...
<!-- agent-space-manager:end -->
```

### TOML Delimiters:
```toml
# >>> agent-space-manager
... managed config ...
# <<< agent-space-manager
```

### Invariants:
- All content outside the delimiters belongs to the developer and must be preserved verbatim.
- Unlinking or updating components modifies only the content between the start and end markers.
- If all managed components are unlinked, the delimiters and enclosed block are removed cleanly without leaving trailing blank lines or altering user content.

---

## 7. User File Precedence
When syncing individual rule files into an agent directory:
- If a file already exists at the destination and is **NOT** tracked in `.asm-owned.json`, do not overwrite it.
- Pre-existing user-authored rules take precedence over hub-synced components.
