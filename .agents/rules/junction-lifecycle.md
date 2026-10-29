---
trigger: always_on
description: "NTFS junction lifecycle, Windows Go os.ReadDir bug avoidance, real-directory materialization, and data preservation"
---

# Safety Invariant 6: Junction Lifecycle, Directory Materialization & Ownership Tracking

## Core Avoidance Mechanism
Maintain filesystem integrity, bypass Go runtime directory traversal bugs on Windows, prevent accidental deletion of source repositories during unlinking, and guarantee 100% preservation of user-owned files and foreign symlinks.

---

## 1. Windows Go `os.ReadDir` NTFS Junction Bug Avoidance

### The Bug Mechanism:
- Google Antigravity's core backend daemon is written in Go.
- On Windows, directory junctions are NTFS reparse points (`IO_REPARSE_TAG_MOUNT_POINT`).
- In Go's standard library `os.ReadDir(dir)` on Windows, directory entries are retrieved via Win32 `FindNextFileW` into `fs.DirEntry` objects.
- In Go, `DirEntry.IsDir()` returns `entry.Type().IsDir()`. For an NTFS directory junction, the reparse point flag is set, which Go maps to `fs.ModeSymlink | fs.ModeIrregular`. Because Go's `os.ReadDir` does not automatically invoke `os.Stat` on directory entries, **`entry.IsDir()` returns `false`**.
- *Impact on Antigravity*: Antigravity scans `~/.gemini/config/plugins` and `~/.gemini/config/skills` using `entries := os.ReadDir(...)` and filters them with:
  ```go
  if !entry.IsDir() {
      continue // Skip non-directories
  }
  ```
  Because junctions report `IsDir() == false`, Antigravity **completely ignores and skips all top-level junctioned plugins and skills on Windows!**

### The Mandatory Solution: Real-Directory Materialization (`adapters.mjs:251-346`):
- For Antigravity plugin bundles (`materializePluginBundle`) and skills (`materializeSkillDir`), Agent Space Manager must **NEVER** create a top-level junction.
- Instead, materialize a **real NTFS directory** on disk:
  1. Create a physical directory via `fs.mkdirSync`.
  2. Embed an ownership manifest `.asm-owned.json` into the root of the materialized directory.
  3. Copy top-level metadata files (`plugin.json`, `SKILL.md`) directly into the real directory.
  4. Create leaf junctions or child symlinks only for deep subdirectories or individual files.
  5. Go's `os.ReadDir()` sees a physical directory with `FILE_ATTRIBUTE_DIRECTORY` and `IsDir() === true`, allowing Antigravity to immediately register all plugins and slash commands.

---

## 2. Safe Unlinking Invariant (Never Delete Source)
- **Severing NTFS Reparse Points**:
  - When unlinking an NTFS directory junction on Windows, ALWAYS use `cmd.exe /c rmdir "${linkPath}"` with fallback to `fs.unlinkSync(linkPath)` (`manager.mjs:1016-1025`).
- **Strict Prohibition on Recursive Link Deletion**:
  - **NEVER** execute `fs.rmSync(linkPath, { recursive: true })` or `rm -rf` directly on an active junction or symlink.
  - In Node.js on Windows, recursive directory removal on a junction can traverse the reparse point and delete the original source repository files in the hub!
- **Materialized Directory Removal**:
  - Before calling `fs.rmSync(dirPath, { recursive: true, force: true })`, verify that `isAsmOwnedDirectory(dirPath)` returns `true` (valid `.asm-owned.json` present) or that the path is recorded in `.asm-state/<ownerId>.json`.

---

## 3. Preserving User-Owned Files & Foreign Symlinks
Developers frequently author custom skills, local scripts, or external symlinks directly inside their agent directories. Agent Space Manager must never clobber user data:

1. **Ownership State Tracking**:
   - Every file, symlink, and directory managed by Agent Space Manager is tracked in `.asm-state/<ownerId>.json` and marked with `.asm-owned.json`.
2. **Foreign Link Protection (`adapters.mjs:239-245`)**:
   ```javascript
   export function isAsmOwnedDirectory(dirPath) {
     try {
       return fs.existsSync(path.join(dirPath, ".asm-owned.json"));
     } catch {
       return false;
     }
   }
   ```
3. **Preservation Check**:
   - Before removing or replacing any file or directory, check:
     1. Is it tracked in `.asm-state/<ownerId>.json`?
     2. Does it contain `.asm-owned.json`?
     3. Does its symlink target resolve into `hubRoot` or `AI Agent Space`?
   - If none of these match, the file is user-owned. **Preserve it untouched.**
   - If a collision occurs with a user-owned directory, abort the operation: `Conflict: user-owned directory or file already exists at ${linkPath}`.

---

## 4. Ghost Directory Cleanup
When all components from a plugin or agent are unlinked, prune empty parent directories in `plugins/` and `skills/` using `sanitizeAgentConfigDirectory()` to eliminate watcher bloat in Language Servers.
