# BRIEFING — 2026-10-29T16:05:00Z

## Mission
Investigate and formulate technical content for modular avoidance rules (4: mcp-schema-guards.md, 5: webview2-dialogs.md, 6: junction-lifecycle.md, 7: watcher-throttling.md) in Agent Space Manager.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigator, synthesizer
- Working directory: d:\Software\Magpie\agent-space-manager\.agents\teamwork\teamwork_explorer_m1_2
- Original parent: 56e62fe3-5ba5-4e9d-8c31-b82ec2cab8ad
- Milestone: Milestone 1 (Modular Safety Invariants)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Write only to .agents/teamwork/teamwork_explorer_m1_2/
- Output path discipline: write report to m1_explorer_2_report.md and handoff.md
- Adhere to Agent Space Manager safety invariants (no kill GUI, no stub files, etc.)
- Use RTK prefix for shell commands if any

## Current Parent
- Conversation ID: 56e62fe3-5ba5-4e9d-8c31-b82ec2cab8ad
- Updated: 2026-10-29T16:05:00Z

## Investigation State
- **Explored paths**:
  - `agents.mjs`: Agent profile definitions, resolvePaths, MCP keys (`mcpServers` vs `servers` vs `mcp`), OpenCode/Codex formats.
  - `adapters.mjs`: `syncJsonMcpServers`, `toOpenCodeMcpEntry`, `syncTomlMcpServers`, `materializePluginBundle`, `materializeSkillDir`, `isAsmOwnedDirectory`, ownership tracking.
  - `manager.mjs`: `createJunction`, `removeJunction`, `sanitizeAgentConfigDirectory`, `killAgentProcesses`, `syncPluginBundles`.
  - `server.mjs`: `startMagpieConfigWatcher` (2000ms polling, unref()).
  - `page/app.js`: Two-step inline confirmation buttons (lines 1204-1218, 1350-1364) and lingering `alert()` calls (lines 2294, 2331).
  - `tests/`: `sync-adapters.test.mjs`, `sync-bundle.test.mjs`, full suite passing 41/41 tests.
- **Key findings**:
  - VS Code Copilot strictly requires root key `"servers"`, OpenCode requires `"mcp"` with `{ type: "local", command: [...], enabled: true, environment: {...} }`, and Codex requires TOML table entries.
  - WebView2 desktop host suppresses synchronous `confirm/alert/prompt`. Two-step inline button state with 4s timer is required; residual alerts in `page/app.js` must be removed in M3.
  - Go's `os.ReadDir` on Windows evaluates NTFS junctions as `IsDir() == false`. Real-directory materialization with `.asm-owned.json` is mandatory for Antigravity.
  - Watchers must throttle polling to >= 2000ms with `.unref()` and 500ms debounce to prevent file descriptor exhaustion (`EMFILE`).
- **Unexplored areas**: None within the scope of rules 4-7.

## Key Decisions Made
- Formulated complete, copy-ready specifications for `mcp-schema-guards.md`, `webview2-dialogs.md`, `junction-lifecycle.md`, and `watcher-throttling.md` in `m1_explorer_2_report.md`.
- Validated all specifications against existing tests and test sandbox invariants.

## Artifact Index
- `DISPATCH.md` — Incoming dispatch records
- `BRIEFING.md` — Persistent working memory
- `progress.md` — Liveness heartbeat
- `m1_explorer_2_report.md` — Detailed technical findings & modular rule specifications (Part 2)
- `handoff.md` — 5-component handoff report
