---
trigger: always_on
description: "File watcher throttling and descriptor protection invariants: minimum polling intervals, debounce guards, ignore patterns, and canonical snapshot hashing"
---

# Safety Invariant 7: File Watcher Throttling, Debounce & Descriptor Protection

## Core Avoidance Mechanism
Protect operating system file descriptor limits (`EMFILE`/`ENFILE`), prevent CPU exhaustion, eliminate cascading file-watcher feedback loops between IDEs and background daemons, and ensure prompt process termination during automated testing.

---

## 1. The Watcher Storm & File Descriptor Exhaustion Problem
- Modern AI IDEs (Cursor, VS Code, Windsurf, Antigravity) run dozens of background language server protocol (LSP) daemons, TypeScript/Rust watchers, and Git status monitors.
- If an agent space manager or plugin sync engine aggressively polls (e.g. 100ms interval) or responds immediately to every raw `fs.watch` event by running full re-scans (`scanPlugins`, `syncAllIdes`), it creates an I/O feedback loop:
  1. ASM writes a link or backup file.
  2. The IDE file watcher detects the change and triggers an LSP re-index.
  3. The LSP writes a cache/temp file.
  4. ASM detects the temp file and triggers another sync.
  5. Disk churn reaches 100%, CPU spikes, and file descriptor limits (`EMFILE: too many open files`) are exhausted, crashing the IDE or daemon.

---

## 2. Polling Rate Limit Invariant (>= 2000ms)
- **Minimum Polling Interval**: Background configuration watchers (such as Magpie daemon watching `plugins.json`) must **NEVER** poll faster than 1000ms. The project baseline is fixed at **>= 2000ms**:
  ```javascript
  // server.mjs:173-175
  magpieWatchInterval = setInterval(() => {
    syncFromMagpiePluginsJson(false);
  }, 2000);
  ```
- **Process Exit Guard (`.unref()`)**:
  Every active background `setInterval` or `setTimeout` handle **MUST** be unreferenced via `.unref()`:
  ```javascript
  // server.mjs:176-178
  if (typeof magpieWatchInterval.unref === "function") {
    magpieWatchInterval.unref();
  }
  ```
  This guarantees that background polling timers do not prevent Node.js process termination or cause integration test runners (`npm test`) to hang indefinitely.

---

## 3. Trailing-Edge Debounce (500ms - 2000ms)
- Watchers using event-driven APIs (`fs.watch` or `chokidar`) must **NEVER** trigger synchronous processing on the initial change event.
- All file change events must be buffered through a trailing-edge debounce timer of at least 500ms (standard: 500ms to 2000ms) to consolidate rapid bursts of writes (such as git branch switches, npm installs, or batch file materializations) into a single execution pass.

---

## 4. Zero-Work Modification Checks (Hash / mtime Guard)
- Polling routines must be guarded by lightweight change detection before executing expensive rescans or synchronization pipelines:
  - Check the target file's `mtimeMs` (modification timestamp) or compare a cryptographic hash (SHA-256).
  - If neither timestamp nor content hash has changed, exit immediately (0 disk writes, 0 rescans, 0 LSP notifications).
- **Deterministic Storage Fingerprinting (`manager.mjs:1732-1960`)**:
  - `getComponentsStorageSnapshot(hubRoot)` computes a SHA-256 canonical hash of all component versions, sizes, and mtimes.
  - Auto-sync executes only if `diffComponentsStorageSnapshots` reports `hasChanges === true`.

---

## 5. High-Churn Directory Exclusion & Git Index Protection
- File watchers must strictly ignore high-churn and transient directories:
  - `.git/`
  - `node_modules/`
  - `.agents/teamwork/`
  - `.asm-state/`
  - Temporary backup files (`*.asm-bak`, `*.tmp`)
- **Git Index Exclusion (`adapters.mjs:968-980`)**:
  - Synchronize relative paths of bridged components into `.git/info/exclude` via `ensureGitInfoExclude(repoPath, relPaths)`.
  - This prevents bridged junctions and materialized component directories from triggering Git status churn or dirtying repositories.
