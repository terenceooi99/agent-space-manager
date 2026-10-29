# Original User Request

## Approved Task Prompt — 2026-10-29T07:41:49Z

Production implementation for Agent Space Manager to require manual connection via a Connect button beside Rescan Hub, default components to unselected/disabled on initial startup while persisting user preferences per agent, replace rather than duplicate connection bridges on reconnection, improve the npm test suite, and research supported agent documentation to modularize safety invariants into categorized markdown files to avoid plugin crashes.

Working directory: d:\Software\Magpie\agent-space-manager
Integrity mode: development

## Requirements

### R1. Manual Connection Trigger and UI Placement
Place a dedicated Connect button directly to the right of the "Rescan Hub" button in the Agent Space Manager interface. Initiating a connection to an agent must only execute upon explicit manual click of this Connect button, rather than connecting automatically.

### R2. Component Default State and Preference Persistence
On initial application startup or when connecting to an agent for the first time, all components must default to unchecked / disabled. Persist and restore user component selections for each connected agent across restarts and subsequent sessions.

### R3. Single Connection Bridge Replacement
When a user manually connects to the same connected agent multiple times with different sets of components, replace the existing connection bridge rather than creating duplicate bridges, preventing connection bloat on the target agent.

### R4. Test Suite Improvements
Improve the automated test suite (`npm test`) with new or updated unit/integration tests verifying the manual connection flow, component default and persistence state, and bridge replacement behavior. Ensure all tests run and pass cleanly.

### R5. Safety Invariant Research and Modular Avoidance Rules
Research documentation for major supported agents in Agent Space Manager (e.g., Antigravity, Cursor, Windsurf, Claude Code/Desktop, OpenCode) to identify plugin/rule conflict and crash avoidance mechanisms. Expand or amend `agent-safety-invariants.md` and split rules into modular topic-specific markdown files in `.agents/rules/` categorized by avoidance mechanism, keeping `agent-safety-invariants.md` as the index and reference point.

## Acceptance Criteria

### UI Controls and Connection Behavior
- [ ] Connect button is rendered immediately to the right of the "Rescan Hub" button in the dashboard interface.
- [ ] Agent connection is initiated exclusively when the user manually clicks the Connect button.

### Component Initialization and Persistence
- [ ] On clean startup or first connection to an agent, all selectable components are unchecked / disabled by default.
- [ ] Custom component selections made by the user are saved and restored for each agent across application restarts.

### Bridge Lifecycle Management
- [ ] Triggering manual connection to an already connected agent with modified components replaces the existing bridge without spawning duplicate bridges or leaking resources.

### Test Suite Verification
- [ ] Test suite in `tests/` is improved to cover manual connection triggering, component default state, preference persistence, and single bridge replacement.
- [ ] Running `rtk npm test` passes 100% of tests with zero failures.

### Safety Invariants and Rule Modularization
- [ ] Crash avoidance mechanisms derived from supported agent documentation are documented.
- [ ] Safety invariants are split into modular markdown files in `.agents/rules/` organized by avoidance mechanism.
- [ ] `.agents/rules/agent-safety-invariants.md` references and indexes the modular rule files cleanly.
