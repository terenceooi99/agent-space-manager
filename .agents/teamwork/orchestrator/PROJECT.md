# Project: Agent Space Manager Connection Flow & Modular Safety Invariants

## Architecture
Agent Space Manager bridges developer components (skills, rules, MCP servers, plugins) from a central hub to diverse AI agents/IDEs (Antigravity, Cursor, Windsurf, Claude Code/Desktop, OpenCode, VS Code Copilot).
- **Frontend Layer**: `page/index.html`, `page/app.js`, `page/style.css` provides the UI dashboard hosted via Magpie WebView2 / local HTTP server.
- **Backend / Engine Layer**: `manager.mjs`, `adapters.mjs`, `server.mjs`, `index.mjs` handles agent detection, component discovery, configuration persistence (`hub-config.json`), junction/symlink linking, rule YAML frontmatter normalization, MCP server registration, and hub communication files (`agent-space-bridge.json`, `shared/agent-connectors.json`).
- **Safety & Rules Layer**: `.agents/rules/` contains modular safety invariants preventing agent crashes, process termination of GUI editors, 0-byte stub files, rule syntax errors, and watcher exhaustion.
- **Test Infrastructure**: `tests/` using Node.js native ESM runner (`node:test`, `node:assert/strict`) with isolated sandbox scratch trees via `tests/helpers.mjs`.

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | R1-A: Connect Button UI Placement | Dedicated Connect button placed directly to the right of "Rescan Hub" button in card-head | M3 | ORIGINAL_REQUEST § R1 |
| 2 | R1-B: Manual Connection Trigger | Agent connection initiated exclusively on explicit click of Connect button; decoupled from auto-sync | M2, M3 | ORIGINAL_REQUEST § R1 |
| 3 | R2-A: Component Default Unchecked | On initial startup or first connection to an agent, all selectable components default to disabled/unchecked | M2, M3 | ORIGINAL_REQUEST § R2 |
| 4 | R2-B: Component Preference Persistence | User component selections are saved and restored per agent across restarts in hubConfig.ides[i].plugins | M2, M3 | ORIGINAL_REQUEST § R2 |
| 5 | R3-A: In-place Agent Deduplication | Connecting to an existing agent replaces/updates the agent entry instead of appending timestamped IDs | M2, M3 | ORIGINAL_REQUEST § R3 |
| 6 | R3-B: Single Bridge Replacement | Reconnection performs differential sync on single canonical bridge without duplicate bridges or leaked resources | M2 | ORIGINAL_REQUEST § R3 |
| 7 | R4-A: Test Suite Improvements | Comprehensive unit/integration tests in tests/ covering R1, R2, R3 lifecycle | M4 | ORIGINAL_REQUEST § R4 |
| 8 | R4-B: 100% Passing Tests | Running `rtk npm test` passes 100% of test suites with zero failures | M4 | ORIGINAL_REQUEST § R4 |
| 9 | R5-A: Agent Crash Avoidance Research | Research documentation on supported agents (Antigravity, Claude, Cursor, Windsurf, OpenCode) | M1 | ORIGINAL_REQUEST § R5 |
| 10 | R5-B: Modular Safety Invariant Files | Split safety rules into topic-specific markdown files in .agents/rules/ by avoidance mechanism | M1 | ORIGINAL_REQUEST § R5 |
| 11 | R5-C: Master Index Reference | Update .agents/rules/agent-safety-invariants.md as master index referencing modular files | M1 | ORIGINAL_REQUEST § R5 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Modular Safety Invariants | Research & modularize safety rules into 7 topic files in `.agents/rules/` with updated index `agent-safety-invariants.md` | none | DONE |
| M2 | Backend Connection Engine & Bridge Replacement | Implement `connectAgent` in `manager.mjs`, `/api/connect` in `server.mjs`, IPC in `index.mjs`, default-unchecked logic, and bridge deduplication | none | DONE |
| M3 | Frontend Connect UI & Preference Persistence | Add `#connectBtn` next to `#rescanBtn`, wire manual connect click, default-unchecked switches, per-agent preference persistence, remove native alerts | M2 | DONE |
| M4 | Test Suite Improvements & Full Verification | Implement `tests/connection-lifecycle.test.mjs`, update workability tests, run and verify `npm test` 100% pass | M1, M2, M3 | DONE |

## Interface Contracts

### Backend ↔ Frontend API (`server.mjs` / `page/app.js`)
- `POST /api/connect`:
  - Request Body: `{ id: string, agentType: string, plugins?: Record<string, boolean>, configPath?: string, exePath?: string, componentPaths?: Record<string, string> }`
  - Response: `{ success: boolean, bridge: object, activeAgents: object[], unlinkedCount?: number, linkedCount?: number, error?: string }`
- `POST /api/save`:
  - Request Body: `{ config: HubConfig, plugins: PluginRecord[] }`
  - Behavior: Persists configuration without triggering physical agent linking (`syncAllIdes`) unless explicit connect flag is passed.
  - Response: `{ success: boolean, config: HubConfig }`

### Manager Core ↔ Server / IPC (`manager.mjs` ↔ `server.mjs` / `index.mjs`)
- `connectAgent(hubConfig, targetIde, options)`:
  - Updates or creates `targetIde` in `hubConfig.ides` in-place (deduplicating by `id`, `agentType`, or `configPath`).
  - Aggregates any legacy timestamped ownership manifests (`ide-<targetIde.id>*.json`) into `ide-<targetIde.id>.json`.
  - Executes differential sync via `syncIdePlugins(targetIde, allPlugins)`.
  - Re-generates `agent-space-bridge.json` and `shared/agent-connectors.json` ensuring single entry for this agent.
  - Returns `{ success: boolean, hubConfig: HubConfig, result: SyncResult }`.

### Component Default Invariant
- Component enabled check: `plugins[pluginId] === true`.
- Undefined, null, or empty `{}` evaluates strictly to `false` (unchecked / disabled).

## Code Layout
- `.agents/rules/`:
  - `agent-safety-invariants.md`: Master index and overview
  - `process-termination.md`: Safety Invariant 1 (Never Kill Primary GUI IDEs)
  - `config-sanitization.md`: Safety Invariant 2 (No 0-byte or empty `{}` stubs)
  - `rule-normalization.md`: Safety Invariant 3 (YAML frontmatter `trigger: always_on`)
  - `mcp-schema-guards.md`: MCP server schema transformations & root key compatibility
  - `webview2-dialogs.md`: Safety Invariant 4 (Desktop WebView2 dialog suppression)
  - `junction-lifecycle.md`: Safety Invariant 5 (Clean unlinking & directory preservation)
  - `watcher-throttling.md`: Safety Invariant 6 (Throttled polling & debounce)
- `manager.mjs`: Core orchestration logic, `connectAgent`, `syncIdePlugins`, `saveHubConfig`
- `adapters.mjs`: Agent-specific bridging, ownership state tracking, rule frontmatter injection, `toOpenCodeMcpEntry`
- `server.mjs`: Local API server routes (`/api/connect`, `/api/save`, `/api/rescan`)
- `index.mjs`: Magpie IPC plugin surface (`connectAgent`)
- `page/index.html`: UI structure, `#connectBtn`, `#rescanBtn`
- `page/app.js`: UI logic, component toggling, preference persistence, manual connect trigger
- `page/style.css`: UI styling
- `tests/`:
  - `connection-lifecycle.test.mjs`: Turnkey integration test for R1, R2, R3
  - `adversarial-stress.test.mjs`: 25-cycle reconnection stress test and invariant verification
  - `workability-status.test.mjs`: Updated for default-disabled components
  - `tests/*.test.mjs`: All 12 test suites passing (65 tests)
