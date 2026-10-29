// D:\Software\Magpie\agent-space-manager\manager.mjs
// Central Agent Space Management Engine for Magpie
// Cross-platform, zero-hardcoded path detection for open-source GitHub distribution.

import fs from "fs";
import path from "path";
import os from "os";
import { createHash } from "node:crypto";
import { execSync, execFileSync, execFile } from "child_process";
import {
  AGENT_PROFILES,
  inferAgentType,
  listAgentProfilesForUi,
  getHomeDir,
  getAppDataDir,
  expandHomePath,
} from "./agents.mjs";
import {
  getStateDir,
  loadOwnershipState,
  saveOwnershipState,
  deleteOwnershipState,
  listAllOwnershipStates,
  isTargetInsideHub,
  isAsmOwnedDirectory,
  materializeSkillDir,
  materializePluginBundle,
  syncPluginBundles,
  collectEnabledComponents,
  syncFlattenedSkills,
  syncSkillSlashCommands,
  syncJsonMcpServers,
  syncTomlMcpServers,
  syncMarkdownRulesBlock,
  syncOwnedFiles,
  syncJsonHooks,
  writeHubCommunicationFiles,
  ensureGitInfoExclude,
} from "./adapters.mjs";
import {
  resolveEffectiveAgentPaths,
  resolveEffectiveProjectPaths,
} from "./agents.mjs";

export {
  AGENT_PROFILES,
  inferAgentType,
  listAgentProfilesForUi,
  expandHomePath,
  deleteOwnershipState,
  listAllOwnershipStates,
  writeHubCommunicationFiles,
  resolveEffectiveAgentPaths,
  resolveEffectiveProjectPaths,
};

/**
 * Resolves the Hub root dynamically:
 * 1. Environment variables AGENT_TOOLS_ROOT or AI_WORKSPACE_DIR
 * 2. Fallback to ~/AI-Agent-Space (or D:\Software\AI Agent Space if present on host)
 */
export function resolveHubRoot() {
  if (process.env.AGENT_TOOLS_ROOT && fs.existsSync(process.env.AGENT_TOOLS_ROOT)) {
    return path.resolve(process.env.AGENT_TOOLS_ROOT);
  }
  if (process.env.AI_WORKSPACE_DIR && fs.existsSync(process.env.AI_WORKSPACE_DIR)) {
    return path.resolve(process.env.AI_WORKSPACE_DIR);
  }
  const home = getHomeDir();
  const homeHub = path.join(home, "AI-Agent-Space");
  if (fs.existsSync(homeHub)) {
    return homeHub;
  }
  if (!process.env.ASM_HOME_OVERRIDE && fs.existsSync("D:\\Software\\AI Agent Space")) {
    return "D:\\Software\\AI Agent Space";
  }
  return homeHub;
}

export const DEFAULT_HUB_ROOT = resolveHubRoot();
export const DEFAULT_CONFIG_FILE = path.join(DEFAULT_HUB_ROOT, "hub-config.json");

/**
 * Ensures a directory exists synchronously
 */
export function ensureDir(dirPath) {
  if (dirPath && !fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Dynamically detects the accurate configuration / plugin / skill link directory
 * for any given Agent IDE or binary across Windows, macOS, and Linux.
 * Delegates to the canonical AGENT_PROFILES registry.
 */
export function detectAgentConfigPath(name = "", exePath = "") {
  const home = getHomeDir();
  const appData = getAppDataDir(home);
  const agentType = inferAgentType(name, exePath);

  if (agentType === "opencode" && exePath && fs.existsSync(exePath)) {
    try {
      let cliExe = exePath;
      if (exePath.endsWith("OpenCode.exe") || exePath.endsWith("OpenCode")) {
        const siblingCli = path.join(path.dirname(exePath), "resources", "opencode-cli.exe");
        if (fs.existsSync(siblingCli)) cliExe = siblingCli;
      }
      const out = execSync(`"${cliExe}" debug paths 2>nul`, { encoding: "utf8" });
      for (const line of out.split("\n")) {
        if (line.trim().startsWith("config")) {
          const parts = line.trim().split(/\s+/);
          if (parts[1]) {
            return path.join(parts.slice(1).join(" "), "skills");
          }
        }
      }
    } catch {}
  }

  const profile = AGENT_PROFILES[agentType] || AGENT_PROFILES.custom;
  const resolved = profile.resolvePaths(home, appData, name);
  return resolved.primary;
}

/**
 * Infers a clean IDE name directly from the executable name.
 * Avoids substring collision bugs (e.g. opencode contains "code").
 */
export function inferNameFromExe(filePath) {
  if (!filePath) return "Agent";
  const base = path.basename(filePath).replace(/\.(exe|lnk|app|cmd|bat)$/i, "");
  const lower = base.toLowerCase();

  if (lower === "opencode" || lower.startsWith("opencode")) return "OpenCode";
  if (lower === "codex" || lower.startsWith("codex")) return "Codex CLI";
  if (lower === "code" || lower === "vscode" || lower === "visualstudiocode") return "VS Code";
  if (lower === "cursor") return "Cursor";
  if (lower === "windsurf") return "Windsurf";
  if (lower === "agy" || lower.includes("antigravity")) return "Antigravity";
  if (lower === "gemini" || lower === "gemini-cli") return "Gemini CLI";
  if (lower === "claude") return "Claude Code";
  if (lower === "cline") return "Cline";
  if (lower === "roo" || lower === "roo-code") return "Roo Code";
  if (lower === "kiro") return "Kiro";
  if (lower === "vscodium" || lower === "codium") return "VSCodium";
  if (lower === "zed") return "Zed";

  return base.charAt(0).toUpperCase() + base.slice(1);
}

/**
 * Resolves a Windows shortcut (.lnk) to its real target path.
 */
export function resolveShortcutTarget(lnkPath) {
  if (process.platform !== "win32") return lnkPath;
  try {
    const escaped = lnkPath.replace(/'/g, "''");
    const psCmd = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; (New-Object -ComObject WScript.Shell).CreateShortcut('${escaped}').TargetPath`;
    const target = execFileSync("powershell", ["-NoProfile", "-Command", psCmd], { encoding: "utf8" }).trim();
    if (target && fs.existsSync(target)) return target;
  } catch {}
  return lnkPath;
}

/**
 * Searches Desktop, Start Menu, LocalAppData, and standard directories
 * for a dropped executable or shortcut when the browser sandbox omits the absolute path.
 */
export function findFileOnSystem(fileName) {
  if (!fileName) return null;
  const userProfile = getHomeDir();
  const localAppData = process.env.LOCALAPPDATA || path.join(userProfile, "AppData", "Local");
  const appData = getAppDataDir(userProfile);

  const cleanName = path.basename(fileName).trim().replace(/^["']|["']$/g, "");
  const baseNoExt = cleanName.replace(/\.(exe|lnk|cmd|bat)$/i, "").toLowerCase();

  if (baseNoExt.includes("opencode")) {
    const candidates = [
      path.join(localAppData, "Programs", "ai.opencode.desktop", "OpenCode.exe"),
      path.join(userProfile, "Desktop", "OpenCode.lnk"),
      path.join(userProfile, "OneDrive", "Desktop", "OpenCode.lnk"),
      path.join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "OpenCode.lnk"),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        return c.toLowerCase().endsWith(".lnk") ? resolveShortcutTarget(c) : c;
      }
    }
  }

  if (baseNoExt === "code" || baseNoExt.includes("vscode")) {
    const candidates = [
      path.join(localAppData, "Programs", "Microsoft VS Code", "Code.exe"),
      "C:\\Program Files\\Microsoft VS Code\\Code.exe",
      path.join(userProfile, "Desktop", "Visual Studio Code.lnk"),
      path.join(userProfile, "OneDrive", "Desktop", "Visual Studio Code.lnk"),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        return c.toLowerCase().endsWith(".lnk") ? resolveShortcutTarget(c) : c;
      }
    }
  }

  if (baseNoExt.includes("cursor")) {
    const c = path.join(localAppData, "Programs", "cursor", "Cursor.exe");
    if (fs.existsSync(c)) return c;
  }

  if (baseNoExt.includes("windsurf")) {
    const c = path.join(localAppData, "Programs", "Windsurf", "Windsurf.exe");
    if (fs.existsSync(c)) return c;
  }

  if (baseNoExt.includes("agy") || baseNoExt.includes("antigravity")) {
    const c = path.join(userProfile, ".gemini", "bin", "agy.cmd");
    if (fs.existsSync(c)) return c;
  }

  const searchNames = [cleanName];
  if (!cleanName.includes(".")) {
    searchNames.push(`${cleanName}.exe`, `${cleanName}.lnk`);
  }

  const directDirs = [
    path.join(userProfile, "Desktop"),
    path.join(userProfile, "OneDrive", "Desktop"),
    "C:\\Users\\Public\\Desktop",
    path.join(appData, "Microsoft", "Windows", "Start Menu", "Programs"),
    "C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs",
    path.join(localAppData, "Programs"),
  ];

  for (const dir of directDirs) {
    if (!fs.existsSync(dir)) continue;
    for (const sName of searchNames) {
      const candidate = path.join(dir, sName);
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return candidate.toLowerCase().endsWith(".lnk") ? resolveShortcutTarget(candidate) : candidate;
        }
      } catch {}
    }
  }

  const deepDirs = [
    path.join(localAppData, "Programs"),
    path.join(appData, "Microsoft", "Windows", "Start Menu", "Programs"),
    path.join(userProfile, "Desktop"),
    path.join(userProfile, "OneDrive", "Desktop"),
  ];

  for (const root of deepDirs) {
    if (!fs.existsSync(root)) continue;
    try {
      const stack = [root];
      while (stack.length > 0) {
        const curr = stack.pop();
        const entries = fs.readdirSync(curr, { withFileTypes: true });
        for (const e of entries) {
          const full = path.join(curr, e.name);
          if (e.isDirectory()) {
            if (!e.name.startsWith(".") && e.name !== "node_modules") {
              stack.push(full);
            }
          } else if (e.isFile()) {
            const eLower = e.name.toLowerCase();
            for (const sName of searchNames) {
              if (eLower === sName.toLowerCase()) {
                return full.toLowerCase().endsWith(".lnk") ? resolveShortcutTarget(full) : full;
              }
            }
          }
        }
      }
    } catch {}
  }

  try {
    const out = execFileSync("where.exe", [cleanName], { encoding: "utf8" }).trim();
    const firstLine = out.split("\n")[0]?.trim();
    if (firstLine && fs.existsSync(firstLine) && fs.statSync(firstLine).isFile()) {
      return firstLine;
    }
  } catch {}

  return null;
}

/**
 * Searches common workspace drives and folders for a project directory
 * when the browser sandbox omits the absolute folder path.
 */
export function findFolderOnSystem(folderName) {
  if (!folderName) return null;
  const clean = path.basename(folderName).trim().replace(/^["']|["']$/g, "").toLowerCase();
  const userProfile = getHomeDir();
  const hubParent = path.dirname(resolveHubRoot());

  const searchRoots = [
    hubParent,
    path.join(userProfile, "Projects"),
    path.join(userProfile, "source", "repos"),
    path.join(userProfile, "Desktop"),
    path.join(userProfile, "OneDrive", "Desktop"),
    path.join(userProfile, "Downloads"),
  ].filter(Boolean);

  for (const root of searchRoots) {
    if (!fs.existsSync(root)) continue;

    const direct = path.join(root, folderName);
    try {
      if (fs.existsSync(direct) && fs.statSync(direct).isDirectory()) {
        return direct;
      }
    } catch {}

    try {
      const queue = [{ dir: root, depth: 1 }];
      while (queue.length > 0) {
        const { dir, depth } = queue.shift();
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          if (!e.isDirectory() || e.name.startsWith(".") || e.name === "node_modules" || e.name === "$RECYCLE.BIN") continue;
          const full = path.join(dir, e.name);
          if (e.name.toLowerCase() === clean) {
            return full;
          }
          if (depth < 3) {
            queue.push({ dir: full, depth: depth + 1 });
          }
        }
      }
    } catch {}
  }
  return null;
}

/**
 * Resolves a dropped file/folder name or raw path into its real, absolute filesystem target,
 * resolving .lnk shortcuts and extracting clean IDE / project names.
 */
export function resolveDroppedTarget(rawNameOrPath, mode = "ide") {
  if (!rawNameOrPath) return { success: false, error: "Empty path" };
  let clean = rawNameOrPath.trim().replace(/^["']|["']$/g, "");

  if (mode === "ide") {
    let candidatePath = clean;
    let found = null;
    if (fs.existsSync(candidatePath) && fs.statSync(candidatePath).isFile()) {
      found = candidatePath;
    } else {
      found = findFileOnSystem(clean);
    }

    if (!found) {
      return { success: false, error: `Could not find executable for '${clean}' on system` };
    }

    let realExe = found;
    if (found.toLowerCase().endsWith(".lnk")) {
      realExe = resolveShortcutTarget(found);
    }

    const name = inferNameFromExe(realExe);
    const agentType = inferAgentType(name, realExe);
    const configPath = detectAgentConfigPath(name, realExe);

    return {
      success: true,
      realPath: realExe,
      name,
      agentType,
      configPath,
      isShortcut: found.toLowerCase().endsWith(".lnk"),
    };
  }

  if (mode === "project") {
    let candidateFolder = clean;
    let found = null;
    if (fs.existsSync(candidateFolder) && fs.statSync(candidateFolder).isDirectory()) {
      found = candidateFolder;
    } else {
      found = findFolderOnSystem(clean);
    }

    if (!found) {
      return { success: false, error: `Could not find project directory for '${clean}' on system` };
    }

    return {
      success: true,
      realPath: found,
      name: path.basename(found),
    };
  }

  return { success: false, error: "Unknown mode" };
}

/**
 * Opens native Windows file or folder dialog asynchronously and resolves the chosen target.
 */
export function browseFileSystem(type = "file") {
  if (process.platform !== "win32") {
    return Promise.resolve({ cancelled: true, error: "Native dialog only supported on Windows" });
  }

  return new Promise((resolve) => {
    let psScript = "";
    if (type === "folder" || type === "directory") {
      psScript = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$app = New-Object -ComObject Shell.Application
$folder = $app.BrowseForFolder(0, "Select Folder", 0x50, 0)
if ($folder) {
  Write-Output $folder.Self.Path
}
`;
    } else {
      psScript = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName System.Windows.Forms
$dialog = New-Object System.Windows.Forms.OpenFileDialog
$dialog.Filter = "Agent Executables & Shortcuts (*.exe;*.lnk)|*.exe;*.lnk|All Files (*.*)|*.*"
$dialog.Title = "Select Agent Executable or Shortcut"
$dialog.ShowHelp = $false
$dialog.RestoreDirectory = $true
if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
  Write-Output $dialog.FileName
}
`;
    }

    const b64 = Buffer.from(psScript, "utf16le").toString("base64");
    execFile(
      "powershell.exe",
      ["-NoProfile", "-OutputFormat", "Text", "-STA", "-EncodedCommand", b64],
      { encoding: "utf8", timeout: 60000 },
      (err, stdout) => {
        if (err) {
          return resolve({ cancelled: true, error: err.message });
        }
        const cleaned = stdout.replace(/#< CLIXML[\s\S]*?<\/Objs>/g, "").trim();
        if (!cleaned) {
          return resolve({ cancelled: true });
        }

        if (type === "folder" || type === "directory") {
          return resolve({
            cancelled: false,
            realPath: cleaned,
            name: path.basename(cleaned),
          });
        }

        let realExe = cleaned;
        if (cleaned.toLowerCase().endsWith(".lnk")) {
          realExe = resolveShortcutTarget(cleaned);
        }
        const name = inferNameFromExe(realExe);
        const agentType = inferAgentType(name, realExe);
        const configPath = detectAgentConfigPath(name, realExe);

        return resolve({
          cancelled: false,
          realPath: realExe,
          name,
          agentType,
          configPath,
        });
      }
    );
  });
}

/**
 * Normalizes and migrates an IDE configuration entry so `agentType` is always populated
 * and leading `~` / `$HOME` / `%USERPROFILE%` paths are expanded to real OS paths.
 */
export function normalizeIdeEntry(ide) {
  if (!ide || typeof ide !== "object") return ide;
  const agentType = inferAgentType(ide);
  const rawConfigPath = ide.configPath || detectAgentConfigPath(agentType, ide.exePath || "");
  let configPath = expandHomePath(rawConfigPath);

  if (agentType === "antigravity" && configPath) {
    const base = path.basename(configPath).toLowerCase();
    const parentBase = path.basename(path.dirname(configPath)).toLowerCase();
    if (base === "config" && parentBase === ".gemini") {
      configPath = path.join(configPath, "plugins");
    } else if (base === ".gemini") {
      configPath = path.join(configPath, "config", "plugins");
    }
  } else if (agentType === "opencode" && configPath) {
    const base = path.basename(configPath).toLowerCase();
    if (base === "opencode") {
      configPath = path.join(configPath, "skills");
    }
  }

  const exePath = ide.exePath ? expandHomePath(ide.exePath) : ide.exePath || "";
  const componentPaths = ide.componentPaths && typeof ide.componentPaths === "object"
    ? { ...ide.componentPaths }
    : {};
  for (const [k, v] of Object.entries(componentPaths)) {
    if (typeof v === "string" && v.trim()) {
      componentPaths[k] = expandHomePath(v.trim());
    }
  }

  return {
    ...ide,
    agentType,
    exePath,
    configPath,
    componentPaths,
    enabled: ide.enabled !== false,
    plugins: ide.plugins && typeof ide.plugins === "object" ? ide.plugins : {},
  };
}

/**
 * Loads hub configuration or returns default structure
 */
export function loadHubConfig(configFile = null) {
  const effectiveFile = configFile || path.join(resolveHubRoot(), "hub-config.json");
  try {
    if (fs.existsSync(effectiveFile)) {
      const data = fs.readFileSync(effectiveFile, "utf8");
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed.ides)) {
        parsed.ides = parsed.ides.map(normalizeIdeEntry);
      } else {
        const defaultHome = getHomeDir();
        parsed.ides = [
          normalizeIdeEntry({
            id: "antigravity",
            name: "Antigravity (Google Gemini)",
            agentType: "antigravity",
            exePath: path.join(defaultHome, ".gemini", "bin", process.platform === "win32" ? "agy.cmd" : "agy"),
            configPath: detectAgentConfigPath("antigravity"),
            enabled: true,
            plugins: {},
          }),
        ];
      }
      if (!Array.isArray(parsed.projects)) {
        parsed.projects = [];
      }
      if (!parsed.hubRoot || parsed.hubRoot.trim() === "") {
        parsed.hubRoot = resolveHubRoot();
      }
      return parsed;
    }
  } catch (err) {
    console.error("Failed to read hub-config.json:", err);
  }

  const defaultHome = getHomeDir();
  return {
    hubRoot: resolveHubRoot(),
    smartMiddleware: {
      enabled: true,
      maxTools: 96,
      autoFilter: true,
      logFailures: true,
    },
    ides: [
      {
        id: "antigravity",
        name: "Antigravity (Google Gemini)",
        agentType: "antigravity",
        exePath: path.join(defaultHome, ".gemini", "bin", process.platform === "win32" ? "agy.cmd" : "agy"),
        configPath: detectAgentConfigPath("antigravity"),
        enabled: true,
        plugins: {},
      },
    ],
    projects: [],
  };
}

/**
 * Deduplicates an array of IDE entries in-place, merging component selections
 * and ensuring only one canonical entry exists per agent type or config path.
 *
 * @param {Array<object>} ides - Array of IDE configuration entries.
 * @returns {Array<object>} Deduplicated array of normalized IDE entries.
 */
export function deduplicateIdes(ides = []) {
  if (!Array.isArray(ides)) return [];
  const seenIds = new Set();
  const seenTargets = new Set();
  const result = [];

  for (const raw of ides) {
    if (!raw) continue;
    const ide = normalizeIdeEntry(raw);
    const idKey = ide.id;
    const normConfig = ide.configPath ? path.resolve(expandHomePath(ide.configPath)) : "";
    const targetKey = `${ide.agentType}::${normConfig}`;

    const existing = result.find((item) => {
      if (item.id === idKey) return true;
      if (idKey && item.id && (item.id.replace(/-\d{10,}$/, "") === idKey.replace(/-\d{10,}$/, ""))) return true;
      if (normConfig && item.agentType === ide.agentType) {
        const itemConfig = item.configPath ? path.resolve(expandHomePath(item.configPath)) : "";
        if (itemConfig === normConfig) return true;
      }
      return false;
    });

    if (existing) {
      // Merge preferences into canonical entry
      existing.plugins = { ...(existing.plugins || {}), ...(ide.plugins || {}) };
      if (ide.componentPaths) {
        existing.componentPaths = { ...(existing.componentPaths || {}), ...ide.componentPaths };
      }
      if (ide.exePath && !existing.exePath) existing.exePath = ide.exePath;
      if (ide.name && (!existing.name || existing.name === existing.id)) existing.name = ide.name;
      continue;
    }

    seenIds.add(idKey);
    if (normConfig) seenTargets.add(targetKey);
    result.push(ide);
  }
  return result;
}

/**
 * Saves hub configuration to file (UTF-8 without BOM) with automated IDE deduplication.
 */
export function saveHubConfig(config, configFile = null) {
  const effectiveFile = configFile || path.join(resolveHubRoot(), "hub-config.json");
  if (config && Array.isArray(config.ides)) {
    config.ides = deduplicateIdes(config.ides);
  }
  ensureDir(path.dirname(effectiveFile));
  fs.writeFileSync(effectiveFile, JSON.stringify(config, null, 2), "utf8");
}

/**
 * Recursively lists files in a directory up to maxDepth with relative paths.
 */
export function listFilesRecursiveRel(dir, baseDir = dir, maxDepth = 4, depth = 0) {
  if (depth > maxDepth || !fs.existsSync(dir)) return [];
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.name.startsWith(".git") || e.name === "node_modules") continue;
      const full = path.join(dir, e.name);
      const rel = path.relative(baseDir, full).replace(/\\/g, "/");
      let isDir = false;
      try {
        isDir = e.isDirectory() || (e.isSymbolicLink() && fs.statSync(full).isDirectory());
      } catch {}

      if (isDir) {
        const sub = listFilesRecursiveRel(full, baseDir, maxDepth, depth + 1);
        results.push(...sub);
      } else {
        try {
          const stats = fs.statSync(full);
          results.push({ name: e.name, relPath: rel, size: stats.size, mtime: Math.round(stats.mtimeMs) });
        } catch {
          results.push({ name: e.name, relPath: rel, size: 0, mtime: 0 });
        }
      }
    }
  } catch {}
  return results;
}

/**
 * Builds a comprehensive categorized registry of Plugins, MCPs, Hooks, Skills, Agents, and Rules.
 */
export function buildCategoriesRegistry(plugins = [], hubRoot = "") {
  const categories = {
    plugins: [],
    mcps: [],
    hooks: [],
    skills: [],
    agents: [],
    rules: [],
  };

  const seenSkills = new Set();
  const seenMcps = new Set();
  const seenHooks = new Set();
  const seenAgents = new Set();
  const seenRules = new Set();

  for (const p of plugins) {
    categories.plugins.push({
      id: p.id,
      name: p.name,
      version: p.version,
      path: p.path,
      description: p.description,
      skillsCount: (p.skills || []).length,
      filesCount: (p.files || []).length,
      hasMcp: p.hasMcp,
      hasHooks: p.hasHooks,
    });

    for (const s of p.skills || []) {
      if (!seenSkills.has(s)) {
        seenSkills.add(s);
        categories.skills.push({
          name: s,
          pluginId: p.id,
          pluginName: p.name,
          sourcePath: p.isRootSkills ? path.join(p.path, s) : path.join(p.path, "skills", s),
        });
      }
    }

    for (const m of p.mcps || []) {
      if (!seenMcps.has(m)) {
        seenMcps.add(m);
        categories.mcps.push({
          name: m,
          pluginId: p.id,
          pluginName: p.name,
          sourcePath: path.join(p.path, "mcp_config.json"),
        });
      }
    }

    if (p.hasHooks) {
      const hookId = `${p.id}-hooks`;
      if (!seenHooks.has(hookId)) {
        seenHooks.add(hookId);
        categories.hooks.push({
          name: `${p.name} Hooks`,
          pluginId: p.id,
          pluginName: p.name,
          sourcePath: path.join(p.path, "hooks.json"),
        });
      }
    }

    for (const a of p.agents || []) {
      if (!seenAgents.has(a)) {
        seenAgents.add(a);
        categories.agents.push({
          name: a,
          pluginId: p.id,
          pluginName: p.name,
          sourcePath: path.join(p.path, "agents", a),
        });
      }
    }

    for (const r of p.rules || []) {
      if (!seenRules.has(r)) {
        seenRules.add(r);
        categories.rules.push({
          name: r,
          pluginId: p.id,
          pluginName: p.name,
          sourcePath: path.join(p.path, "rules", r),
        });
      }
    }
  }

  if (hubRoot && fs.existsSync(hubRoot)) {
    const rootAgentsDir = path.join(hubRoot, "agents");
    if (fs.existsSync(rootAgentsDir)) {
      try {
        for (const a of fs.readdirSync(rootAgentsDir)) {
          if (a.endsWith(".md") && !seenAgents.has(a)) {
            seenAgents.add(a);
            categories.agents.push({
              name: a,
              pluginId: "root",
              pluginName: "Root Agents",
              sourcePath: path.join(rootAgentsDir, a),
            });
          }
        }
      } catch {}
    }

    const rootRulesDir = path.join(hubRoot, "rules");
    if (fs.existsSync(rootRulesDir)) {
      try {
        for (const r of fs.readdirSync(rootRulesDir)) {
          if (r.endsWith(".md") && !seenRules.has(r)) {
            seenRules.add(r);
            categories.rules.push({
              name: r,
              pluginId: "root",
              pluginName: "Root Rules",
              sourcePath: path.join(rootRulesDir, r),
            });
          }
        }
      } catch {}
    }
  }

  return categories;
}

/**
 * Scans plugins directory for all standard plugin packages and root standalone components.
 */
export function scanPlugins(hubRoot = resolveHubRoot()) {
  if (!hubRoot || typeof hubRoot !== "string") return [];
  const cleanHub = expandHomePath(hubRoot.trim());
  if (!cleanHub || !fs.existsSync(cleanHub)) return [];

  let pluginsDir = path.join(cleanHub, "plugins");
  if (!fs.existsSync(pluginsDir)) {
    if (fs.existsSync(cleanHub)) {
      try {
        const sub = fs.readdirSync(cleanHub);
        const hasManifest = sub.some((name) => {
          const itemPath = path.join(cleanHub, name);
          try {
            if (!fs.statSync(itemPath).isDirectory()) return false;
            return (
              fs.existsSync(path.join(itemPath, "plugin.json")) ||
              fs.existsSync(path.join(itemPath, "skills")) ||
              fs.existsSync(path.join(itemPath, "rules")) ||
              fs.existsSync(path.join(itemPath, "mcp_config.json"))
            );
          } catch {
            return false;
          }
        });
        if (hasManifest) {
          pluginsDir = cleanHub;
        } else {
          return [];
        }
      } catch {
        return [];
      }
    } else {
      return [];
    }
  }

  let entries = [];
  try {
    entries = fs.readdirSync(pluginsDir);
  } catch {
    return [];
  }
  const plugins = [];

  for (const entryName of entries) {
    const pluginDir = path.join(pluginsDir, entryName);
    try {
      if (!fs.statSync(pluginDir).isDirectory()) continue;
    } catch {
      continue;
    }
    const manifestPath = path.join(pluginDir, "plugin.json");

    let manifest = { name: entryName, version: "1.0.0", description: "" };
    if (fs.existsSync(manifestPath)) {
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      } catch {
        manifest.description = "Invalid plugin.json";
      }
    } else {
      const hasSkills = fs.existsSync(path.join(pluginDir, "skills"));
      const hasRules = fs.existsSync(path.join(pluginDir, "rules"));
      const hasMcp = fs.existsSync(path.join(pluginDir, "mcp_config.json"));
      if (!hasSkills && !hasRules && !hasMcp) continue;
    }

    const hasMcp = fs.existsSync(path.join(pluginDir, "mcp_config.json"));
    const hasHooks = fs.existsSync(path.join(pluginDir, "hooks.json"));

    let mcps = [];
    if (hasMcp) {
      try {
        const mcpData = JSON.parse(fs.readFileSync(path.join(pluginDir, "mcp_config.json"), "utf8"));
        if (mcpData.mcpServers) mcps = Object.keys(mcpData.mcpServers);
      } catch {}
      if (mcps.length === 0) mcps = [entryName];
    }

    let hooks = [];
    if (hasHooks) {
      try {
        const hookData = JSON.parse(fs.readFileSync(path.join(pluginDir, "hooks.json"), "utf8"));
        if (Array.isArray(hookData)) hooks = hookData;
        else if (hookData.hooks) hooks = Object.keys(hookData.hooks);
      } catch {}
      if (hooks.length === 0) hooks = ["smart-tools"];
    }

    const skillsDir = path.join(pluginDir, "skills");
    const skills = [];
    if (fs.existsSync(skillsDir)) {
      try {
        for (const s of fs.readdirSync(skillsDir, { withFileTypes: true })) {
          let isDir = false;
          try {
            isDir = s.isDirectory() || (s.isSymbolicLink() && fs.statSync(path.join(skillsDir, s.name)).isDirectory());
          } catch {}
          if (isDir) skills.push(s.name);
        }
      } catch {}
    }

    const rulesDir = path.join(pluginDir, "rules");
    const rules = [];
    if (fs.existsSync(rulesDir)) {
      try {
        for (const r of fs.readdirSync(rulesDir, { withFileTypes: true })) {
          if (r.isFile() && r.name.endsWith(".md")) rules.push(r.name);
        }
      } catch {}
    }

    const agentsDir = path.join(pluginDir, "agents");
    const agents = [];
    if (fs.existsSync(agentsDir)) {
      try {
        for (const a of fs.readdirSync(agentsDir, { withFileTypes: true })) {
          if (a.isFile() && a.name.endsWith(".md")) agents.push(a.name);
        }
      } catch {}
    }

    const files = listFilesRecursiveRel(pluginDir, pluginDir);

    plugins.push({
      id: entryName,
      name: manifest.name || entryName,
      version: manifest.version || "1.0.0",
      description: manifest.description || "",
      path: pluginDir,
      hasMcp,
      hasHooks,
      mcps,
      hooks,
      skills,
      rules,
      agents,
      files,
    });
  }

  // Also discover standalone root skills/ if present (e.g. <hubRoot>/skills),
  // excluding duplicates that already belong to a discovered plugin in <hubRoot>/plugins/*.
  if (pluginsDir !== cleanHub) {
    const rootSkillsDir = path.join(cleanHub, "skills");
    if (fs.existsSync(rootSkillsDir)) {
      try {
        const pluginSkillSet = new Set(plugins.flatMap((p) => p.skills || []));
        const rootSkills = [];
        for (const se of fs.readdirSync(rootSkillsDir, { withFileTypes: true })) {
          if (pluginSkillSet.has(se.name)) continue;
          let isDir = false;
          try {
            isDir = se.isDirectory() || (se.isSymbolicLink() && fs.statSync(path.join(rootSkillsDir, se.name)).isDirectory());
          } catch {}
          if (isDir) rootSkills.push(se.name);
        }
        if (rootSkills.length > 0) {
          const rootSkillFiles = listFilesRecursiveRel(rootSkillsDir, rootSkillsDir);
          plugins.push({
            id: "workspace-skills",
            name: "Workspace Skills (Root Hub)",
            version: "1.0.0",
            description: `Standalone skills collection (${rootSkills.length} skills) located in root skills/ folder`,
            path: rootSkillsDir,
            isRootSkills: true,
            hasMcp: false,
            hasHooks: false,
            mcps: [],
            hooks: [],
            skills: rootSkills,
            rules: [],
            agents: [],
            files: rootSkillFiles,
          });
        }
      } catch {}
    }
  }

  return plugins;
}

/**
 * Safely creates a directory junction (Windows) or symlink (macOS/Linux).
 * Refuses to delete any real, user-owned directory or file at `linkPath`.
 */
export function createJunction(sourcePath, linkPath) {
  try {
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      return { success: false, error: `Source path does not exist: ${sourcePath}` };
    }

    if (path.resolve(sourcePath) === path.resolve(linkPath)) {
      return { success: true, message: "Source and link path are identical" };
    }

    try {
      const stats = fs.lstatSync(linkPath);
      if (stats.isSymbolicLink()) {
        try {
          const currentTarget = fs.readlinkSync(linkPath);
          if (path.resolve(currentTarget) === path.resolve(sourcePath)) {
            return { success: true, message: "Link already exists and is correct" };
          }
        } catch {}
        removeJunction(linkPath);
      } else {
        // Real directory or file exists at linkPath — NEVER delete user-owned data!
        return {
          success: false,
          error: `Conflict: user-owned directory or file already exists at ${linkPath}`,
        };
      }
    } catch {
      // linkPath doesn't exist yet, proceed
    }

    ensureDir(path.dirname(linkPath));
    if (process.platform === "win32") {
      execSync(`cmd.exe /c mklink /J "${linkPath}" "${sourcePath}"`, { stdio: "pipe" });
    } else {
      fs.symlinkSync(sourcePath, linkPath, "dir");
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Safely removes a directory junction or symlink without touching target files
 * and without deleting real directories.
 */
export function removeJunction(linkPath) {
  try {
    let stats;
    try {
      stats = fs.lstatSync(linkPath);
    } catch {
      return { success: true }; // does not exist
    }

    if (stats.isSymbolicLink()) {
      if (process.platform === "win32") {
        try {
          execSync(`cmd.exe /c rmdir "${linkPath}"`, { stdio: "pipe" });
          return { success: true };
        } catch {
          try {
            fs.unlinkSync(linkPath);
            return { success: true };
          } catch {}
        }
      } else {
        fs.unlinkSync(linkPath);
        return { success: true };
      }
    } else {
      return {
        success: false,
        error: `Refusing to remove non-symlink path: ${linkPath}`,
      };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
  return { success: true };
}

/**
 * Helper to filter previously owned files belonging to a specific target directory and optional file suffix.
 */
function filterOwnedFilesForSpec(allFiles = [], spec) {
  if (!spec) return [];
  const dir = path.resolve(typeof spec === "string" ? spec : spec.dir);
  const suffix = typeof spec === "object" && spec.suffix ? spec.suffix.toLowerCase() : null;
  return (allFiles || []).filter((f) => {
    const res = path.resolve(f);
    if (path.dirname(res) !== dir) return false;
    if (!suffix) return true;
    const lower = res.toLowerCase();
    if (suffix === ".md") {
      return (
        lower.endsWith(".md") &&
        !lower.endsWith(".prompt.md") &&
        !lower.endsWith(".instructions.md") &&
        !lower.endsWith(".agent.md")
      );
    }
    return lower.endsWith(suffix);
  });
}

/**
 * Syncs components for an IDE based on its Agent Profile (`bundle` vs `convert` mode)
 * and persists the ownership manifest so only tool-owned items are ever pruned.
 */
/**
 * Proactively sanitizes and guards an agent configuration directory against corrupted
 * or schema-violating stub files (e.g. 0-byte JSONs, empty {} projects without id, empty ghost folders).
 * Ensures background Language Servers and file watchers never enter crash loops for any connected agent.
 */
export function sanitizeAgentConfigDirectory(configDir, agentType = "general") {
  if (!configDir || !fs.existsSync(configDir)) return;
  try {
    // 1. Sanitize projects / workspace manifests (e.g. ~/.gemini/config/projects/)
    const projDir = path.join(configDir, "projects");
    if (fs.existsSync(projDir)) {
      for (const ent of fs.readdirSync(projDir)) {
        if (!ent.endsWith(".json")) continue;
        const p = path.join(projDir, ent);
        try {
          const st = fs.statSync(p);
          if (st.size === 0) {
            fs.unlinkSync(p);
            continue;
          }
          const content = fs.readFileSync(p, "utf8").trim();
          if (content === "{}" || content === "") {
            fs.unlinkSync(p);
            continue;
          }
          try {
            const parsed = JSON.parse(content);
            if (parsed && typeof parsed === "object" && !parsed.id) {
              fs.unlinkSync(p);
            }
          } catch {
            try { fs.unlinkSync(p); } catch {}
          }
        } catch {}
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
            if (st.isDirectory()) {
              const children = fs.readdirSync(itemPath);
              if (children.length === 0) {
                fs.rmSync(itemPath, { recursive: true, force: true });
              }
            }
          } catch {}
        }
      }
    }
  } catch {}
}

export function syncIdePlugins(ide, allPlugins = []) {
  if (!ide) return { success: false, message: "No IDE provided" };
  const normalized = normalizeIdeEntry(ide);
  const agentType = normalized.agentType;
  const profile = AGENT_PROFILES[agentType] || AGENT_PROFILES.custom;
  const home = getHomeDir();
  const appData = getAppDataDir(home);
  const paths = resolveEffectiveAgentPaths(normalized, home, appData);
  const primaryDir = expandHomePath(paths.primary || paths.bundle || paths.skills || normalized.configPath);

  if (!primaryDir) {
    return { success: false, message: "No config path specified" };
  }

  // Universal Safety Fallback: sanitize config directories before syncing
  sanitizeAgentConfigDirectory(primaryDir, agentType);
  sanitizeAgentConfigDirectory(path.dirname(primaryDir), agentType);

  const ownerKey = `ide-${normalized.id || agentType}`;
  const prevState = loadOwnershipState(ownerKey);

  // Mode 1: Bundle Agent (Antigravity)
  if (profile.mode === "bundle") {
    const bundleDir = paths.bundle || primaryDir;
    ensureDir(bundleDir);

    const activePluginMap = new Map();
    for (const plugin of allPlugins) {
      const isEnabled = Boolean(normalized.plugins && normalized.plugins[plugin.id] === true);
      if (isEnabled && plugin.path && fs.existsSync(plugin.path) && !plugin.isRootSkills) {
        activePluginMap.set(plugin.id, plugin.path);
      }
    }

    const prevLinksSet = new Set((prevState.links || []).map((p) => path.resolve(p)));
    const bundleLinks = [];
    const results = [];

    // Use syncPluginBundles which uses real-directory materialization on Windows
    // to bypass Go os.ReadDir IsDir() == false bug on junctions!
    const bundleRes = syncPluginBundles(
      bundleDir,
      activePluginMap,
      prevState.links || [],
      createJunction,
      removeJunction,
      allPlugins,
      ownerKey
    );
    bundleLinks.push(...bundleRes.bundleLinks);
    results.push(...bundleRes.results);

    // 3. Antigravity ~/.gemini/config harmonization:
    //    - Link ALL enabled skills into ~/.gemini/config/skills/<skill-name> so `/` slash commands work for all plugins & root skills
    //    - Sync enabled rules into ~/.gemini/config/rules/ and subagents into ~/.gemini/config/agents/ for `@` mentions
    //    - Clean any stray hub junctions directly under ~/.gemini/config/
    //    - Harmonize skills.json without wiping user's non-hub entries
    const isGeminiIde = agentType === "antigravity" || primaryDir.toLowerCase().includes(".gemini");
    let skillLinks = [];
    let nextFiles = [];
    const nextJsonKeys = {};
    const nextBlocks = [];
    const components = collectEnabledComponents(allPlugins, normalized.plugins);

    if (isGeminiIde) {
      const geminiConfigDir = path.dirname(bundleDir);
      const geminiSkillsDir = paths.skills || path.join(geminiConfigDir, "skills");
      const geminiRulesSpec = paths.rules || paths.rulesDir || { dir: path.join(geminiConfigDir, "rules"), suffix: ".md" };
      const geminiAgentsSpec = paths.agents || paths.agentsDir || { dir: path.join(geminiConfigDir, "agents"), suffix: ".md" };
      const geminiSkillsJson = paths.skillsJson || path.join(geminiConfigDir, "skills.json");

      // Clean any stray plugin junctions that were mistakenly created directly in geminiConfigDir
      try {
        if (fs.existsSync(geminiConfigDir)) {
          for (const entryName of fs.readdirSync(geminiConfigDir)) {
            if (entryName === "plugins" || entryName === "skills" || entryName === "rules" || entryName === "agents") {
              continue;
            }
            const entryPath = path.join(geminiConfigDir, entryName);
            try {
              const st = fs.lstatSync(entryPath);
              if (st.isSymbolicLink()) {
                const tgt = fs.readlinkSync(entryPath);
                if (prevLinksSet.has(path.resolve(entryPath)) || isTargetInsideHub(tgt, allPlugins)) {
                  removeJunction(entryPath);
                }
              }
            } catch {}
          }
        }
      } catch {}

      // Clean any prevState.links from old/changed configPath directories (e.g. unexpanded `~` directories)
      const prevSkillLinks = (prevState.links || []).filter(
        (l) => path.dirname(path.resolve(l)) === path.resolve(geminiSkillsDir)
      );
      for (const oldLink of prevState.links || []) {
        const oldParent = path.dirname(path.resolve(oldLink));
        if (oldParent !== path.resolve(bundleDir) && oldParent !== path.resolve(geminiSkillsDir)) {
          removeJunction(oldLink);
        }
      }

      // Sync flattened skills into ~/.gemini/config/skills/<skill-name>
      const skillSync = syncFlattenedSkills(
        components.skills,
        geminiSkillsDir,
        prevSkillLinks,
        createJunction,
        removeJunction,
        allPlugins,
        ownerKey
      );
      skillLinks = skillSync.nextLinks;

      // Ensure outside-of-project.json is never created with empty object which breaks LS project reader
      try {
        const projDir = path.join(geminiConfigDir, "projects");
        const defaultProjFile = path.join(projDir, "outside-of-project.json");
        if (fs.existsSync(defaultProjFile)) {
          const content = fs.readFileSync(defaultProjFile, "utf8").trim();
          if (content === "{}" || content === "") {
            fs.unlinkSync(defaultProjFile);
          }
        }
      } catch {}

      // Sync rules & subagents into ~/.gemini/config/rules and ~/.gemini/config/agents
      const prevRuleFiles = filterOwnedFilesForSpec(prevState.files, geminiRulesSpec);
      const prevAgentFiles = filterOwnedFilesForSpec(prevState.files, geminiAgentsSpec);
      const rFiles = syncOwnedFiles(components.rules, geminiRulesSpec, prevRuleFiles);
      const aFiles = syncOwnedFiles(components.agents, geminiAgentsSpec, prevAgentFiles);
      nextFiles.push(...rFiles.nextFiles, ...aFiles.nextFiles);

      if (fs.existsSync(geminiSkillsJson)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(geminiSkillsJson, "utf8"));
          if (parsed && Array.isArray(parsed.entries)) {
            const filtered = parsed.entries.filter((entry) => {
              const entryPath = typeof entry === "string" ? entry : entry?.path;
              return !isTargetInsideHub(entryPath, allPlugins, resolveHubRoot());
            });
            fs.writeFileSync(geminiSkillsJson, JSON.stringify({ ...parsed, entries: filtered }, null, 2), "utf8");
          }
        } catch {}
      }
    }

    if (paths.mcp) {
      const prevKeys = (prevState.jsonKeys && prevState.jsonKeys[paths.mcp.file]) || [];
      const jsonRes = syncJsonMcpServers(paths.mcp, components.mcpServers, prevKeys);
      if (jsonRes.ownedKeys.length > 0) nextJsonKeys[paths.mcp.file] = jsonRes.ownedKeys;
    }
    if (paths.hooks) {
      const prevHooks = (prevState.jsonKeys && prevState.jsonKeys[paths.hooks.file]) || [];
      const hookRes = syncJsonHooks(paths.hooks, components.hooks, prevHooks);
      if (hookRes.ownedKeys.length > 0) nextJsonKeys[paths.hooks.file] = hookRes.ownedKeys;
    }

    const allOwnedLinks = [...bundleLinks, ...skillLinks];
    saveOwnershipState(ownerKey, { links: allOwnedLinks, files: nextFiles, jsonKeys: nextJsonKeys, blocks: nextBlocks });
    return {
      success: true,
      agentType,
      mode: "bundle",
      summary: {
        plugins: bundleLinks.length,
        skills: skillLinks.length,
        rules: components.rules.length,
        agents: components.agents.length,
      },
      results,
    };
  }

  // Mode 2: Native-Format Converted Agent (Claude Code, Codex, OpenCode, Copilot, Cursor, Windsurf, Gemini CLI, Cline, Roo, Kiro, Universal, Custom)
  const components = collectEnabledComponents(allPlugins, normalized.plugins);
  const skillsTargetDir = paths.skills || primaryDir;

  // 1. Link flattened skills (<skillsTargetDir>/<skill-name>/SKILL.md)
  const skillSync = syncFlattenedSkills(
    components.skills,
    skillsTargetDir,
    prevState.links || [],
    createJunction,
    removeJunction,
    allPlugins,
    ownerKey
  );

  // 2. Sync `/` quick-action slash command files (commands/, global_workflows/, prompts/, etc.)
  let nextFiles = [];
  let commandsSyncedCount = 0;
  if (paths.commandsDir) {
    const prevCmdFiles = filterOwnedFilesForSpec(prevState.files, paths.commandsDir);
    const cmdRes = syncSkillSlashCommands(components.skills, paths.commandsDir, prevCmdFiles);
    nextFiles.push(...cmdRes.nextFiles);
    commandsSyncedCount = cmdRes.nextFiles.length;
  }

  // 3. Sync MCP Servers into native JSON or TOML config
  const nextJsonKeys = {};
  const nextBlocks = [];
  let mcpSyncedCount = 0;

  if (paths.mcp) {
    if (paths.mcp.format === "toml-block") {
      const hadBlock = (prevState.blocks || []).includes(paths.mcp.file);
      const tomlRes = syncTomlMcpServers(paths.mcp.file, components.mcpServers, hadBlock);
      if (tomlRes.hasBlock) {
        nextBlocks.push(paths.mcp.file);
        mcpSyncedCount = Object.keys(components.mcpServers).length;
      }
    } else {
      const prevKeys = (prevState.jsonKeys && prevState.jsonKeys[paths.mcp.file]) || [];
      const jsonRes = syncJsonMcpServers(paths.mcp, components.mcpServers, prevKeys);
      if (jsonRes.ownedKeys.length > 0) {
        nextJsonKeys[paths.mcp.file] = jsonRes.ownedKeys;
      }
      mcpSyncedCount = jsonRes.ownedKeys.length;
    }
  }

  // 4. Sync Rules (either Markdown block in CLAUDE.md/AGENTS.md/GEMINI.md or file copies in rulesDir)
  let rulesSyncedCount = 0;
  if (paths.rules) {
    const hadBlock = (prevState.blocks || []).includes(paths.rules.file);
    const mdRes = syncMarkdownRulesBlock(paths.rules, components.rules, hadBlock);
    if (mdRes.hasBlock) {
      nextBlocks.push(paths.rules.file);
      rulesSyncedCount = components.rules.length;
    }
  }

  if (paths.rulesDir) {
    const prevRuleFiles = filterOwnedFilesForSpec(prevState.files, paths.rulesDir);
    const rFiles = syncOwnedFiles(components.rules, paths.rulesDir, prevRuleFiles);
    nextFiles.push(...rFiles.nextFiles);
    rulesSyncedCount = rFiles.nextFiles.length;
  }

  // 5. Sync Subagents (`@` mentions in ~/.claude/agents, ~/.config/opencode/agents, Cursor agents, or VS Code prompts)
  let agentsSyncedCount = 0;
  const agentTargetSpec = paths.agents || paths.agentsDir;
  if (agentTargetSpec) {
    const prevAgentFiles = filterOwnedFilesForSpec(prevState.files, agentTargetSpec);
    const aFiles = syncOwnedFiles(components.agents, agentTargetSpec, prevAgentFiles);
    nextFiles.push(...aFiles.nextFiles);
    agentsSyncedCount = aFiles.nextFiles.length;
  }

  // 6. Sync Hooks (e.g. ~/.claude/hooks.json)
  if (paths.hooks) {
    const prevHooks = (prevState.jsonKeys && prevState.jsonKeys[paths.hooks.file]) || [];
    const hookRes = syncJsonHooks(paths.hooks, components.hooks, prevHooks);
    if (hookRes.ownedKeys.length > 0) {
      nextJsonKeys[paths.hooks.file] = hookRes.ownedKeys;
    }
  }

  saveOwnershipState(ownerKey, {
    links: skillSync.nextLinks,
    files: nextFiles,
    jsonKeys: nextJsonKeys,
    blocks: nextBlocks,
  });

  return {
    success: true,
    agentType,
    mode: "convert",
    summary: {
      skills: skillSync.nextLinks.length,
      commands: commandsSyncedCount,
      mcp: mcpSyncedCount,
      rules: rulesSyncedCount,
      agents: agentsSyncedCount,
      conflicts: components.conflicts.length,
    },
    conflicts: components.conflicts,
    results: skillSync.results,
  };
}

/**
 * Syncs project-level plugin overrides into a repository workspace and adds entries to `.git/info/exclude`.
 */
export function syncProjectOverrides(project, ide, allPlugins = []) {
  const repoPath = project?.repoPath ? expandHomePath(project.repoPath) : "";
  if (!project || !repoPath || !fs.existsSync(repoPath)) {
    return { success: false, message: "Project repository path does not exist" };
  }

  const agentType = inferAgentType(ide || project.ideId || "antigravity");
  const projPaths = resolveEffectiveProjectPaths(project, ide);

  // Merge IDE global plugin map with project-specific override map
  const mergedPluginMap = {
    ...(ide?.plugins || {}),
    ...(project.plugins || {}),
  };

  const ownerKey = `project-${project.id || path.basename(repoPath)}`;
  const prevState = loadOwnershipState(ownerKey);
  const components = collectEnabledComponents(allPlugins, mergedPluginMap);

  const skillSync = syncFlattenedSkills(
    components.skills,
    projPaths.skills,
    prevState.links || [],
    createJunction,
    removeJunction,
    allPlugins,
    ownerKey
  );

  const nextJsonKeys = {};
  const nextBlocks = [];
  if (projPaths.mcp) {
    if (projPaths.mcp.format === "toml-block") {
      const hadBlock = (prevState.blocks || []).includes(projPaths.mcp.file);
      const tomlRes = syncTomlMcpServers(projPaths.mcp.file, components.mcpServers, hadBlock);
      if (tomlRes.hasBlock) nextBlocks.push(projPaths.mcp.file);
    } else {
      const prevKeys = (prevState.jsonKeys && prevState.jsonKeys[projPaths.mcp.file]) || [];
      const jsonRes = syncJsonMcpServers(projPaths.mcp, components.mcpServers, prevKeys);
      if (jsonRes.ownedKeys.length > 0) nextJsonKeys[projPaths.mcp.file] = jsonRes.ownedKeys;
    }
  }

  if (projPaths.rules) {
    const hadBlock = (prevState.blocks || []).includes(projPaths.rules.file);
    const mdRes = syncMarkdownRulesBlock(projPaths.rules, components.rules, hadBlock);
    if (mdRes.hasBlock) nextBlocks.push(projPaths.rules.file);
  }

  if (projPaths.hooks) {
    const prevHooks = (prevState.jsonKeys && prevState.jsonKeys[projPaths.hooks.file]) || [];
    const hookRes = syncJsonHooks(projPaths.hooks, components.hooks, prevHooks);
    if (hookRes.ownedKeys.length > 0) nextJsonKeys[projPaths.hooks.file] = hookRes.ownedKeys;
  }

  let nextFiles = [];
  if (projPaths.commandsDir) {
    const prevCmdFiles = filterOwnedFilesForSpec(prevState.files, projPaths.commandsDir);
    const cmdRes = syncSkillSlashCommands(components.skills, projPaths.commandsDir, prevCmdFiles);
    nextFiles.push(...cmdRes.nextFiles);
  }
  if (projPaths.agents) {
    const prevAgentFiles = filterOwnedFilesForSpec(prevState.files, projPaths.agents);
    const aFiles = syncOwnedFiles(components.agents, projPaths.agents, prevAgentFiles);
    nextFiles.push(...aFiles.nextFiles);
  }

  if (projPaths.excludeRel) {
    ensureGitInfoExclude(repoPath, projPaths.excludeRel);
  }

  saveOwnershipState(ownerKey, {
    links: skillSync.nextLinks,
    files: nextFiles,
    jsonKeys: nextJsonKeys,
    blocks: nextBlocks,
  });

  return {
    success: true,
    project: project.name,
    agentType,
    skillsLinked: skillSync.nextLinks.length,
    results: skillSync.results,
  };
}

/**
 * Safely terminates running processes matching the agent's executable path or process names.
 * Ensures component removal takes effect immediately without requiring a computer reboot.
 */
export function killAgentProcesses(ide) {
  if (!ide) return { success: true };
  if (process.env.NODE_ENV === "test" || process.env.ASM_TEST === "1") {
    return { success: true, skipped: "test-environment" };
  }
  const normalized = normalizeIdeEntry(ide);
  const type = normalized.agentType || inferAgentType(normalized);

  // Protected Primary GUI Editors: All modern AI IDEs hot-reload configuration on disk.
  // Forcefully killing them terminates developer sessions and unsaved work.
  const PROTECTED_GUI_AGENTS = new Set([
    "antigravity",
    "cursor",
    "windsurf",
    "vscode",
    "vscode-copilot",
    "vscodium",
    "opencode",
    "kiro",
    "gemini-cli",
    "cline",
    "roo-code",
  ]);

  if (PROTECTED_GUI_AGENTS.has(type) && !normalized.forceKill) {
    return { success: true, skipped: "gui-editor-hot-reload-protected" };
  }

  // Never kill known editor executables even if custom agent names are passed
  const PROTECTED_EXECUTABLES = new Set([
    "antigravity.exe",
    "antigravity ide.exe",
    "agy.exe",
    "cursor.exe",
    "windsurf.exe",
    "code.exe",
    "codium.exe",
    "vscodium.exe",
    "opencode.exe",
    "electron.exe",
    "devenv.exe",
    "idea64.exe",
  ]);

  const targets = new Set();
  if (normalized.exePath) {
    const exeName = path.basename(normalized.exePath).toLowerCase();
    if (!PROTECTED_EXECUTABLES.has(exeName)) {
      targets.add(exeName);
    }
  }

  let killedAny = false;
  for (const procName of targets) {
    if (!procName) continue;
    try {
      if (process.platform === "win32") {
        // Use graceful termination rather than forceful /F /T
        execSync(`taskkill /IM "${procName}"`, { stdio: "ignore" });
        killedAny = true;
      } else {
        execSync(`pkill -f "${procName}"`, { stdio: "ignore" });
        killedAny = true;
      }
    } catch {}
  }

  return { success: true, killed: killedAny };
}

/**
 * Severs all owned junctions, MCP keys, rule blocks, and copied files for a given IDE when removed.
 */
export function unlinkAllForIde(ide, killProcesses = false) {
  if (!ide) return { success: true };
  const normalized = normalizeIdeEntry(ide);
  const ownerKey = `ide-${normalized.id || normalized.agentType}`;
  // Passing empty allPlugins cleanly unlinks and prunes all owned links, files, MCP keys, hooks, blocks!
  syncIdePlugins(normalized, []);
  deleteOwnershipState(ownerKey);
  if (killProcesses) {
    killAgentProcesses(normalized);
  }
  return { success: true };
}

/**
 * Severs all owned junctions, MCP keys, rule blocks, and copied files for a given Project when removed.
 */
export function unlinkAllForProject(project, ide = null) {
  if (!project) return { success: true };
  const ownerKey = `project-${project.id || path.basename(project.repoPath || "")}`;
  syncProjectOverrides({ ...project, plugins: {} }, ide, []);
  deleteOwnershipState(ownerKey);
  return { success: true };
}

/**
 * Finds all indices in hubConfig.ides matching a target IDE by:
 * 1. Exact ID match (case-insensitive)
 * 2. Base ID match (stripping trailing timestamp suffixes)
 * 3. Normalized configPath match (resolving ~ and symlinks)
 * 4. Standard agentType match (for non-custom single-instance agents)
 *
 * @param {Array<object>} ides - Array of configured IDE objects.
 * @param {object} targetIde - The normalized target IDE object.
 * @returns {Array<number>} Matching indices in ides array.
 */
export function findMatchingIdeIndices(ides = [], targetIde = {}) {
  if (!Array.isArray(ides) || !targetIde) return [];

  const targetId = String(targetIde.id || "").trim().toLowerCase();
  const targetType = String(targetIde.agentType || "").trim().toLowerCase();
  const targetBaseId = targetId.replace(/-\d{10,}$/, "");
  const targetConfig = targetIde.configPath
    ? path.resolve(expandHomePath(targetIde.configPath)).toLowerCase()
    : "";

  const matches = [];

  for (let idx = 0; idx < ides.length; idx++) {
    const entry = ides[idx];
    if (!entry || typeof entry !== "object") continue;

    const entryId = String(entry.id || "").trim().toLowerCase();
    const entryBaseId = entryId.replace(/-\d{10,}$/, "");
    const entryType = String(entry.agentType || "").trim().toLowerCase();
    const entryConfig = entry.configPath
      ? path.resolve(expandHomePath(entry.configPath)).toLowerCase()
      : "";

    // Match 1: Exact ID match
    if (targetId && entryId && entryId === targetId) {
      matches.push(idx);
      continue;
    }

    // Match 2: Base ID match (e.g. "antigravity-1730188045123" vs "antigravity")
    if (targetBaseId && entryBaseId && entryBaseId === targetBaseId) {
      matches.push(idx);
      continue;
    }

    // Match 3: Config path match (same physical directory on disk)
    if (targetConfig && entryConfig && entryConfig === targetConfig) {
      matches.push(idx);
      continue;
    }

    // Match 4: Standard agentType match (for built-in agents like cursor, windsurf, antigravity)
    if (
      targetType &&
      targetType !== "custom" &&
      (entryType === targetType || entryId === targetType || entryBaseId === targetType)
    ) {
      matches.push(idx);
      continue;
    }
  }

  return matches;
}

/**
 * Connects or reconnects an agent IDE, replacing any existing bridge for that agent
 * rather than creating duplicate bridges. Guarantees in-place deduplication,
 * ownership manifest aggregation, clean differential teardown, and safety invariant compliance.
 *
 * @param {object} hubConfig - The current hub configuration object.
 * @param {object} targetIde - The IDE entry to connect (with updated plugins map).
 * @param {object} [options] - Additional connection options:
 *   - customPlugins: Array of pre-scanned plugin objects.
 *   - allPlugins: Alias for customPlugins.
 *   - effHub: Effective hub root directory path.
 *   - configFile: Custom path to hub-config.json.
 *   - skipSave: Whether to skip saving hubConfig.
 * @returns {object} { success: boolean, hubConfig: object, result: object, sync: object, bridge: object, activeAgents: Array, ide: object }
 */
export function connectAgent(hubConfig, targetIde, options = {}) {
  if (!targetIde || typeof targetIde !== "object") {
    return {
      success: false,
      error: "Target IDE is required",
      hubConfig: hubConfig || null,
      result: null,
    };
  }

  // Ensure valid hubConfig object
  const config = hubConfig || loadHubConfig(options.configFile);
  if (!Array.isArray(config.ides)) {
    config.ides = [];
  }

  const effectiveHub = options.effHub || getEffectiveHubRoot(config);
  const plugins = options.customPlugins || options.allPlugins || scanPlugins(effectiveHub);

  // 1. Normalize target IDE definition
  const normTarget = normalizeIdeEntry(targetIde);
  const targetType = normTarget.agentType || inferAgentType(normTarget);
  normTarget.agentType = targetType;

  // 2. Identify matching entries in hubConfig.ides
  const matchingIndices = findMatchingIdeIndices(config.ides, normTarget);

  // Determine canonical ID (clean string without timestamp suffix)
  let canonicalId = String(normTarget.id || "").trim();
  if (matchingIndices.length > 0) {
    const cleanExisting = matchingIndices
      .map((idx) => config.ides[idx])
      .find((entry) => entry && entry.id && !/-\d{10,}$/.test(entry.id));

    if (cleanExisting) {
      canonicalId = cleanExisting.id;
    } else {
      canonicalId = (canonicalId || targetType || "custom").replace(/-\d{10,}$/, "");
    }
  } else {
    canonicalId = (canonicalId || targetType || "custom").replace(/-\d{10,}$/, "");
  }
  if (!canonicalId) canonicalId = targetType || "custom";
  normTarget.id = canonicalId;

  // 3. Track duplicate IDs for ownership aggregation and handoff cleanup
  const removedDuplicateIds = new Set();
  if (targetIde.id && targetIde.id !== canonicalId) {
    removedDuplicateIds.add(targetIde.id);
  }

  // 4. In-Place Deduplication of config.ides
  let updatedIde = null;

  if (matchingIndices.length > 0) {
    const primaryIdx = matchingIndices[0];
    const existingEntry = config.ides[primaryIdx] || {};

    if (existingEntry.id && existingEntry.id !== canonicalId) {
      removedDuplicateIds.add(existingEntry.id);
    }

    // Collect IDs of any duplicate matching entries
    for (let k = 1; k < matchingIndices.length; k++) {
      const dupEntry = config.ides[matchingIndices[k]];
      if (dupEntry && dupEntry.id && dupEntry.id !== canonicalId) {
        removedDuplicateIds.add(dupEntry.id);
      }
    }

    const newPlugins = targetIde.plugins !== undefined && targetIde.plugins !== null
      ? (typeof targetIde.plugins === "object" ? { ...targetIde.plugins } : {})
      : (existingEntry.plugins ? { ...existingEntry.plugins } : {});

    updatedIde = normalizeIdeEntry({
      ...existingEntry,
      ...normTarget,
      id: canonicalId,
      agentType: targetType,
      enabled: true,
      plugins: newPlugins,
    });

    config.ides[primaryIdx] = updatedIde;

    // Remove any additional duplicate entries from config.ides
    if (matchingIndices.length > 1) {
      const dupSet = new Set(matchingIndices.slice(1));
      config.ides = config.ides.filter((_, idx) => !dupSet.has(idx));
    }
  } else {
    // New agent connection
    updatedIde = normalizeIdeEntry({
      ...normTarget,
      id: canonicalId,
      agentType: targetType,
      enabled: true,
      plugins: targetIde.plugins && typeof targetIde.plugins === "object" ? { ...targetIde.plugins } : {},
    });
    config.ides.push(updatedIde);
  }

  // 5. Aggregate legacy timestamped ownership manifests into ide-<canonicalId>.json
  const canonicalOwnerKey = `ide-${canonicalId}`;
  const canonicalState = loadOwnershipState(canonicalOwnerKey);
  const stateDir = getStateDir();

  if (fs.existsSync(stateDir)) {
    try {
      const stateFiles = fs.readdirSync(stateDir).filter((f) => f.endsWith(".json"));
      for (const filename of stateFiles) {
        const ownerId = filename.slice(0, -5);
        if (ownerId === canonicalOwnerKey) continue;

        let isMatch = false;

        // Condition A: Matches an explicit duplicate ID removed from config.ides
        for (const dupId of removedDuplicateIds) {
          if (ownerId === `ide-${dupId}` || ownerId === dupId) {
            isMatch = true;
            break;
          }
        }

        // Condition B: Matches timestamped pattern ide-<canonicalId>-<timestamp>
        if (!isMatch) {
          const canonPrefix = `ide-${canonicalId}-`;
          const typePrefix = targetType && targetType !== "custom" ? `ide-${targetType}-` : null;
          if (ownerId.startsWith(canonPrefix) || (typePrefix && ownerId.startsWith(typePrefix))) {
            isMatch = true;
          }
        }

        if (isMatch) {
          const legacyState = loadOwnershipState(ownerId);

          // Merge links
          for (const link of legacyState.links || []) {
            if (!canonicalState.links.includes(link)) {
              canonicalState.links.push(link);
            }
          }

          // Merge files
          for (const file of legacyState.files || []) {
            if (!canonicalState.files.includes(file)) {
              canonicalState.files.push(file);
            }
          }

          // Merge JSON keys
          if (legacyState.jsonKeys && typeof legacyState.jsonKeys === "object") {
            for (const [keyPath, keys] of Object.entries(legacyState.jsonKeys)) {
              if (!canonicalState.jsonKeys[keyPath]) {
                canonicalState.jsonKeys[keyPath] = Array.isArray(keys) ? [...keys] : [];
              } else {
                const mergedKeySet = new Set(canonicalState.jsonKeys[keyPath]);
                for (const k of keys || []) mergedKeySet.add(k);
                canonicalState.jsonKeys[keyPath] = Array.from(mergedKeySet);
              }
            }
          }

          // Merge demarcated blocks
          for (const block of legacyState.blocks || []) {
            if (!canonicalState.blocks.includes(block)) {
              canonicalState.blocks.push(block);
            }
          }

          // Delete obsolete state file from disk
          deleteOwnershipState(ownerId);
        }
      }
    } catch {}
  }

  // Persist aggregated state so syncIdePlugins diffs against all prior artifacts
  saveOwnershipState(canonicalOwnerKey, canonicalState);

  // Pre-sync directory sanitization (Safety Invariant 2)
  const primaryDir = updatedIde.configPath ? expandHomePath(updatedIde.configPath) : "";
  if (primaryDir && fs.existsSync(primaryDir)) {
    sanitizeAgentConfigDirectory(primaryDir, updatedIde.agentType);
  }

  // 6. Differential Sync: syncIdePlugins tears down unselected components & creates selected ones
  const syncResult = syncIdePlugins(updatedIde, plugins);

  // Post-sync directory sanitization
  if (primaryDir && fs.existsSync(primaryDir)) {
    sanitizeAgentConfigDirectory(primaryDir, updatedIde.agentType);
  }

  // 7. Persist configuration and regenerate communication bridge files
  if (options.skipSave !== true) {
    try {
      saveHubConfig(config, options.configFile);
    } catch {}
  }

  try {
    writeHubCommunicationFiles(effectiveHub, config, plugins, { ides: [syncResult] });
  } catch {}

  // 8. Prune stale handoff directories on disk for removed duplicate IDs
  for (const dupId of removedDuplicateIds) {
    if (dupId && dupId !== canonicalId) {
      const staleHandoff = path.join(effectiveHub, "shared", "handoff", dupId);
      try {
        if (fs.existsSync(staleHandoff)) {
          fs.rmSync(staleHandoff, { recursive: true, force: true });
        }
      } catch {}
    }
  }

  // 9. Read fresh bridge payload
  let bridge = null;
  let activeAgents = [];
  try {
    const bridgeFile = path.join(effectiveHub, "agent-space-bridge.json");
    if (fs.existsSync(bridgeFile)) {
      bridge = JSON.parse(fs.readFileSync(bridgeFile, "utf8"));
      activeAgents = bridge.activeAgents || [];
    }
  } catch {}

  return {
    success: syncResult.success !== false,
    hubConfig: config,
    result: syncResult,
    sync: syncResult,
    bridge: bridge || {},
    activeAgents: activeAgents.length > 0 ? activeAgents : (bridge?.activeAgents || []),
    ide: updatedIde,
  };
}

/**
 * Resolves the effective Hub root path from a config object or path string.
 * When blank, always returns the default Hub root (never loops into 1st IDE's configPath).
 */
export function getEffectiveHubRoot(configOrPath) {
  if (typeof configOrPath === "string") {
    if (configOrPath && configOrPath.trim() !== "") return expandHomePath(configOrPath.trim());
    return resolveHubRoot();
  }
  if (configOrPath && typeof configOrPath === "object") {
    if (configOrPath.hubRoot && configOrPath.hubRoot.trim() !== "") {
      return expandHomePath(configOrPath.hubRoot.trim());
    }
  }
  return resolveHubRoot();
}

/**
 * Synchronizes all configured IDEs and Project Overrides against the given hubConfig or plugin list.
 * Automatically reconciles and unlinks any removed IDEs/projects, and updates hub communication files.
 */
export function syncAllIdes(hubConfig, customPlugins = null) {
  if (!hubConfig) return { success: true, results: [], projectResults: [] };
  const effectiveHub = getEffectiveHubRoot(hubConfig);
  const plugins = customPlugins !== null ? customPlugins : scanPlugins(effectiveHub);
  const syncResults = [];
  const projectResults = [];

  const ides = Array.isArray(hubConfig.ides) ? hubConfig.ides : [];
  const projects = Array.isArray(hubConfig.projects) ? hubConfig.projects : [];

  // 1. Reconcile deleted / removed IDEs and Projects from ownership states
  const activeOwnerIds = new Set([
    ...ides.filter((i) => i.enabled !== false).map((i) => `ide-${i.id || inferAgentType(i)}`),
    ...projects.map((p) => `project-${p.id || path.basename(p.repoPath || "")}`),
  ]);

  try {
    const allStates = listAllOwnershipStates();
    for (const st of allStates) {
      if (!activeOwnerIds.has(st.ownerId)) {
        for (const link of st.links || []) {
          removeJunction(link);
          try {
            if (fs.existsSync(link)) {
              const ls = fs.lstatSync(link);
              if (ls.isSymbolicLink()) fs.unlinkSync(link);
              else if (isAsmOwnedDirectory(link)) fs.rmSync(link, { recursive: true, force: true });
            }
          } catch {}
        }
        for (const file of st.files || []) {
          try {
            if (fs.existsSync(file)) fs.unlinkSync(file);
          } catch {}
        }
        deleteOwnershipState(st.ownerId);
      }
    }
  } catch {}

  // 2. Sync all active IDEs
  for (const ide of ides) {
    if (ide.enabled !== false && (ide.configPath || ide.componentPaths)) {
      const res = syncIdePlugins(ide, plugins);
      syncResults.push({ ide: ide.name, ideId: ide.id, ...res });
    } else {
      unlinkAllForIde(ide);
    }
  }

  // 3. Sync all project overrides
  for (const proj of projects) {
    if (proj.repoPath) {
      const parentIde = ides.find((i) => i.id === proj.ideId) || ides[0] || null;
      const pRes = syncProjectOverrides(proj, parentIde, plugins);
      projectResults.push(pRes);
    }
  }

  // 4. Update cross-agent communication files in D:\Software\AI Agent Space
  try {
    writeHubCommunicationFiles(effectiveHub, hubConfig, plugins, { ides: syncResults, projects: projectResults });
  } catch {}

  // 5. Update components storage snapshot to reflect current sync state
  try {
    const currentSnap = getComponentsStorageSnapshot(effectiveHub);
    saveComponentsStorageSnapshot(effectiveHub, currentSnap);
  } catch {}

  return { success: true, results: syncResults, projectResults };
}

/**
 * Resolves the state file path for saving the Components Storage Path snapshot.
 */
export function getSnapshotFilePath(hubRoot = resolveHubRoot()) {
  const clean = getEffectiveHubRoot(hubRoot);
  const hashKey = createHash("md5").update(path.resolve(clean).toLowerCase()).digest("hex").slice(0, 10);
  return path.join(getStateDir(), `components-snapshot-${hashKey}.json`);
}

/**
 * Persists the components storage snapshot to the state directory.
 */
export function saveComponentsStorageSnapshot(hubRoot, snapshot) {
  try {
    const filePath = getSnapshotFilePath(hubRoot);
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), "utf8");
    return true;
  } catch {
    return false;
  }
}

/**
 * Loads the persisted components storage snapshot for the specified hubRoot.
 */
export function loadComponentsStorageSnapshot(hubRoot = resolveHubRoot()) {
  try {
    const filePath = getSnapshotFilePath(hubRoot);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf8"));
    }
  } catch {}
  return null;
}

/**
 * Scans the Components Storage Path (where skills, MCPs, rules, agents, and plugins are saved)
 * and generates a deterministic fingerprint snapshot with component lists, mtimes, and canonical hash.
 */
export function getComponentsStorageSnapshot(hubRoot = resolveHubRoot()) {
  const cleanHub = getEffectiveHubRoot(hubRoot);
  if (!cleanHub || !fs.existsSync(cleanHub)) {
    return {
      hubRoot: cleanHub,
      exists: false,
      timestamp: Date.now(),
      plugins: {},
      rootComponents: { skills: {}, rules: {}, agents: {}, mcp: null, hooks: null },
      hash: "empty",
      summary: { pluginCount: 0, skillCount: 0, ruleCount: 0, agentCount: 0, mcpCount: 0, hookCount: 0 },
    };
  }

  // Determine plugins directory (plugins/ subdirectory or cleanHub directly if manifests present)
  let pluginsDir = path.join(cleanHub, "plugins");
  if (!fs.existsSync(pluginsDir)) {
    try {
      const sub = fs.readdirSync(cleanHub);
      const hasManifest = sub.some((name) => {
        const itemPath = path.join(cleanHub, name);
        try {
          if (!fs.statSync(itemPath).isDirectory()) return false;
          return (
            fs.existsSync(path.join(itemPath, "plugin.json")) ||
            fs.existsSync(path.join(itemPath, "skills")) ||
            fs.existsSync(path.join(itemPath, "rules")) ||
            fs.existsSync(path.join(itemPath, "mcp_config.json"))
          );
        } catch {
          return false;
        }
      });
      if (hasManifest) pluginsDir = cleanHub;
    } catch {}
  }

  const plugins = {};
  let totalSkills = 0;
  let totalRules = 0;
  let totalAgents = 0;
  let totalMcps = 0;
  let totalHooks = 0;

  if (fs.existsSync(pluginsDir)) {
    try {
      const entries = fs.readdirSync(pluginsDir);
      for (const entry of entries) {
        if (entry.startsWith(".") || entry === "node_modules") continue;
        const pDir = path.join(pluginsDir, entry);
        try {
          const st = fs.statSync(pDir);
          if (!st.isDirectory()) continue;
        } catch {
          continue;
        }

        const manifestPath = path.join(pDir, "plugin.json");
        let manifestInfo = null;
        if (fs.existsSync(manifestPath)) {
          try {
            const mStat = fs.statSync(manifestPath);
            const mContent = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
            manifestInfo = {
              version: mContent.version || "1.0.0",
              mtime: Math.round(mStat.mtimeMs),
              size: mStat.size,
            };
          } catch {
            manifestInfo = { version: "unknown", mtime: 0, size: 0 };
          }
        }

        // Skills inside plugin
        const pluginSkills = {};
        const skillsDir = path.join(pDir, "skills");
        if (fs.existsSync(skillsDir)) {
          try {
            for (const s of fs.readdirSync(skillsDir)) {
              const sPath = path.join(skillsDir, s);
              try {
                const sStat = fs.statSync(sPath);
                if (sStat.isDirectory()) {
                  const skillMd = path.join(sPath, "SKILL.md");
                  let smStat = null;
                  if (fs.existsSync(skillMd)) {
                    try { smStat = fs.statSync(skillMd); } catch {}
                  }
                  pluginSkills[s] = {
                    mtime: Math.round(smStat ? smStat.mtimeMs : sStat.mtimeMs),
                    size: smStat ? smStat.size : 0,
                  };
                  totalSkills++;
                }
              } catch {}
            }
          } catch {}
        }

        // Rules inside plugin
        const pluginRules = {};
        const rulesDir = path.join(pDir, "rules");
        if (fs.existsSync(rulesDir)) {
          try {
            for (const r of fs.readdirSync(rulesDir)) {
              if (!r.endsWith(".md")) continue;
              const rPath = path.join(rulesDir, r);
              try {
                const rStat = fs.statSync(rPath);
                pluginRules[r] = { mtime: Math.round(rStat.mtimeMs), size: rStat.size };
                totalRules++;
              } catch {}
            }
          } catch {}
        }

        // Agents inside plugin
        const pluginAgents = {};
        const agentsDir = path.join(pDir, "agents");
        if (fs.existsSync(agentsDir)) {
          try {
            for (const a of fs.readdirSync(agentsDir)) {
              if (!a.endsWith(".md")) continue;
              const aPath = path.join(agentsDir, a);
              try {
                const aStat = fs.statSync(aPath);
                pluginAgents[a] = { mtime: Math.round(aStat.mtimeMs), size: aStat.size };
                totalAgents++;
              } catch {}
            }
          } catch {}
        }

        // MCP inside plugin
        let mcpInfo = null;
        const mcpFile = path.join(pDir, "mcp_config.json");
        if (fs.existsSync(mcpFile)) {
          try {
            const mcpStat = fs.statSync(mcpFile);
            mcpInfo = { mtime: Math.round(mcpStat.mtimeMs), size: mcpStat.size };
            totalMcps++;
          } catch {}
        }

        // Hooks inside plugin
        let hooksInfo = null;
        const hooksFile = path.join(pDir, "hooks.json");
        if (fs.existsSync(hooksFile)) {
          try {
            const hStat = fs.statSync(hooksFile);
            hooksInfo = { mtime: Math.round(hStat.mtimeMs), size: hStat.size };
            totalHooks++;
          } catch {}
        }

        // Files count & total size for catch-all modification sensitivity
        let totalFilesCount = 0;
        let totalFilesSize = 0;
        let maxFileMtime = 0;
        try {
          const files = listFilesRecursiveRel(pDir, pDir);
          totalFilesCount = files.length;
          for (const f of files) {
            totalFilesSize += f.size || 0;
            if (f.mtime && f.mtime > maxFileMtime) maxFileMtime = f.mtime;
          }
        } catch {}

        if (manifestInfo || Object.keys(pluginSkills).length > 0 || Object.keys(pluginRules).length > 0 || mcpInfo) {
          plugins[entry] = {
            version: manifestInfo?.version || "1.0.0",
            manifest: manifestInfo,
            skills: pluginSkills,
            rules: pluginRules,
            agents: pluginAgents,
            mcp: mcpInfo,
            hooks: hooksInfo,
            filesCount: totalFilesCount,
            totalSize: totalFilesSize,
            maxMtime: maxFileMtime,
          };
        }
      }
    } catch {}
  }

  // Root standalone components in hubRoot
  const rootSkills = {};
  const rootSkillsDir = path.join(cleanHub, "skills");
  if (fs.existsSync(rootSkillsDir)) {
    try {
      for (const s of fs.readdirSync(rootSkillsDir)) {
        const sPath = path.join(rootSkillsDir, s);
        try {
          const sStat = fs.statSync(sPath);
          if (sStat.isDirectory()) {
            const skillMd = path.join(sPath, "SKILL.md");
            let smStat = null;
            if (fs.existsSync(skillMd)) {
              try { smStat = fs.statSync(skillMd); } catch {}
            }
            rootSkills[s] = {
              mtime: Math.round(smStat ? smStat.mtimeMs : sStat.mtimeMs),
              size: smStat ? smStat.size : 0,
            };
            totalSkills++;
          }
        } catch {}
      }
    } catch {}
  }

  const rootRules = {};
  const rootRulesDir = path.join(cleanHub, "rules");
  if (fs.existsSync(rootRulesDir)) {
    try {
      for (const r of fs.readdirSync(rootRulesDir)) {
        if (!r.endsWith(".md")) continue;
        const rPath = path.join(rootRulesDir, r);
        try {
          const rStat = fs.statSync(rPath);
          rootRules[r] = { mtime: Math.round(rStat.mtimeMs), size: rStat.size };
          totalRules++;
        } catch {}
      }
    } catch {}
  }

  const rootAgents = {};
  const rootAgentsDir = path.join(cleanHub, "agents");
  if (fs.existsSync(rootAgentsDir)) {
    try {
      for (const a of fs.readdirSync(rootAgentsDir)) {
        if (!a.endsWith(".md")) continue;
        const aPath = path.join(rootAgentsDir, a);
        try {
          const aStat = fs.statSync(aPath);
          rootAgents[a] = { mtime: Math.round(aStat.mtimeMs), size: aStat.size };
          totalAgents++;
        } catch {}
      }
    } catch {}
  }

  let rootMcp = null;
  const rootMcpFile = path.join(cleanHub, "mcp_config.json");
  if (fs.existsSync(rootMcpFile)) {
    try {
      const mStat = fs.statSync(rootMcpFile);
      rootMcp = { mtime: Math.round(mStat.mtimeMs), size: mStat.size };
      totalMcps++;
    } catch {}
  }

  let rootHooks = null;
  const rootHooksFile = path.join(cleanHub, "hooks.json");
  if (fs.existsSync(rootHooksFile)) {
    try {
      const hStat = fs.statSync(rootHooksFile);
      rootHooks = { mtime: Math.round(hStat.mtimeMs), size: hStat.size };
      totalHooks++;
    } catch {}
  }

  const rootComponents = {
    skills: rootSkills,
    rules: rootRules,
    agents: rootAgents,
    mcp: rootMcp,
    hooks: rootHooks,
  };

  const canonicalObj = {
    hubRoot: cleanHub,
    plugins,
    rootComponents,
  };

  function canonicalize(val) {
    if (val === null || typeof val !== "object") return val;
    if (Array.isArray(val)) return val.map(canonicalize);
    const sorted = {};
    for (const k of Object.keys(val).sort()) {
      sorted[k] = canonicalize(val[k]);
    }
    return sorted;
  }

  const canonicalJson = JSON.stringify(canonicalize(canonicalObj));
  const hash = createHash("sha256").update(canonicalJson).digest("hex");

  return {
    hubRoot: cleanHub,
    exists: true,
    timestamp: Date.now(),
    plugins,
    rootComponents,
    hash,
    summary: {
      pluginCount: Object.keys(plugins).length,
      skillCount: totalSkills,
      ruleCount: totalRules,
      agentCount: totalAgents,
      mcpCount: totalMcps,
      hookCount: totalHooks,
    },
  };
}

/**
 * Computes exact differences between two components storage snapshots.
 */
export function diffComponentsStorageSnapshots(prev, current) {
  if (!current) return { hasChanges: false, summary: "No current snapshot provided" };
  if (!prev) {
    const s = current.summary || {};
    return {
      hasChanges: true,
      isInitial: true,
      pathChanged: false,
      pluginsAdded: Object.keys(current.plugins || {}),
      pluginsRemoved: [],
      pluginsModified: [],
      skillsAdded: Object.keys(current.rootComponents?.skills || {}).map((s) => `root/${s}`),
      skillsRemoved: [],
      skillsModified: [],
      rulesAdded: Object.keys(current.rootComponents?.rules || {}).map((r) => `root/${r}`),
      rulesRemoved: [],
      rulesModified: [],
      agentsAdded: Object.keys(current.rootComponents?.agents || {}).map((a) => `root/${a}`),
      agentsRemoved: [],
      agentsModified: [],
      mcpModified: false,
      hooksModified: false,
      summary: `Initial components baseline recorded (${s.pluginCount || 0} plugins, ${s.skillCount || 0} skills, ${s.mcpCount || 0} MCP, ${s.ruleCount || 0} rules)`,
    };
  }

  const pathChanged =
    path.resolve(String(prev.hubRoot || "")).toLowerCase() !==
    path.resolve(String(current.hubRoot || "")).toLowerCase();

  if (prev.hash === current.hash && !pathChanged) {
    return {
      hasChanges: false,
      isInitial: false,
      pathChanged: false,
      pluginsAdded: [],
      pluginsRemoved: [],
      pluginsModified: [],
      skillsAdded: [],
      skillsRemoved: [],
      skillsModified: [],
      rulesAdded: [],
      rulesRemoved: [],
      rulesModified: [],
      agentsAdded: [],
      agentsRemoved: [],
      agentsModified: [],
      mcpModified: false,
      hooksModified: false,
      summary: "Components Storage Path is up to date (no changes detected)",
    };
  }

  const prevPlugins = prev.plugins || {};
  const currPlugins = current.plugins || {};

  const pluginsAdded = Object.keys(currPlugins).filter((id) => !prevPlugins[id]);
  const pluginsRemoved = Object.keys(prevPlugins).filter((id) => !currPlugins[id]);
  const pluginsModified = [];

  const skillsAdded = [];
  const skillsRemoved = [];
  const skillsModified = [];
  const rulesAdded = [];
  const rulesRemoved = [];
  const rulesModified = [];
  const agentsAdded = [];
  const agentsRemoved = [];
  const agentsModified = [];

  // Check plugins diff
  for (const id of Object.keys(currPlugins)) {
    if (!prevPlugins[id]) continue;
    const pPrev = prevPlugins[id];
    const pCurr = currPlugins[id];
    let isMod = false;

    if (pPrev.version !== pCurr.version) isMod = true;
    if (pPrev.manifest?.mtime !== pCurr.manifest?.mtime || pPrev.manifest?.size !== pCurr.manifest?.size) isMod = true;
    if (pPrev.filesCount !== pCurr.filesCount || pPrev.totalSize !== pCurr.totalSize || pPrev.maxMtime !== pCurr.maxMtime) isMod = true;

    // Check skills
    for (const s of Object.keys(pCurr.skills || {})) {
      if (!pPrev.skills?.[s]) {
        skillsAdded.push(`${id}/${s}`);
        isMod = true;
      } else if (pPrev.skills[s].mtime !== pCurr.skills[s].mtime || pPrev.skills[s].size !== pCurr.skills[s].size) {
        skillsModified.push(`${id}/${s}`);
        isMod = true;
      }
    }
    for (const s of Object.keys(pPrev.skills || {})) {
      if (!pCurr.skills?.[s]) {
        skillsRemoved.push(`${id}/${s}`);
        isMod = true;
      }
    }

    // Check rules
    for (const r of Object.keys(pCurr.rules || {})) {
      if (!pPrev.rules?.[r]) {
        rulesAdded.push(`${id}/${r}`);
        isMod = true;
      } else if (pPrev.rules[r].mtime !== pCurr.rules[r].mtime || pPrev.rules[r].size !== pCurr.rules[r].size) {
        rulesModified.push(`${id}/${r}`);
        isMod = true;
      }
    }
    for (const r of Object.keys(pPrev.rules || {})) {
      if (!pCurr.rules?.[r]) {
        rulesRemoved.push(`${id}/${r}`);
        isMod = true;
      }
    }

    // Check agents
    for (const a of Object.keys(pCurr.agents || {})) {
      if (!pPrev.agents?.[a]) {
        agentsAdded.push(`${id}/${a}`);
        isMod = true;
      } else if (pPrev.agents[a].mtime !== pCurr.agents[a].mtime || pPrev.agents[a].size !== pCurr.agents[a].size) {
        agentsModified.push(`${id}/${a}`);
        isMod = true;
      }
    }
    for (const a of Object.keys(pPrev.agents || {})) {
      if (!pCurr.agents?.[a]) {
        agentsRemoved.push(`${id}/${a}`);
        isMod = true;
      }
    }

    // Check MCP & hooks
    if (JSON.stringify(pPrev.mcp) !== JSON.stringify(pCurr.mcp)) isMod = true;
    if (JSON.stringify(pPrev.hooks) !== JSON.stringify(pCurr.hooks)) isMod = true;

    if (isMod) pluginsModified.push(id);
  }

  // Check root components diff
  const prevRoot = prev.rootComponents || {};
  const currRoot = current.rootComponents || {};

  // Root skills
  for (const s of Object.keys(currRoot.skills || {})) {
    if (!prevRoot.skills?.[s]) skillsAdded.push(`root/${s}`);
    else if (prevRoot.skills[s].mtime !== currRoot.skills[s].mtime || prevRoot.skills[s].size !== currRoot.skills[s].size) {
      skillsModified.push(`root/${s}`);
    }
  }
  for (const s of Object.keys(prevRoot.skills || {})) {
    if (!currRoot.skills?.[s]) skillsRemoved.push(`root/${s}`);
  }

  // Root rules
  for (const r of Object.keys(currRoot.rules || {})) {
    if (!prevRoot.rules?.[r]) rulesAdded.push(`root/${r}`);
    else if (prevRoot.rules[r].mtime !== currRoot.rules[r].mtime || prevRoot.rules[r].size !== currRoot.rules[r].size) {
      rulesModified.push(`root/${r}`);
    }
  }
  for (const r of Object.keys(prevRoot.rules || {})) {
    if (!currRoot.rules?.[r]) rulesRemoved.push(`root/${r}`);
  }

  // Root agents
  for (const a of Object.keys(currRoot.agents || {})) {
    if (!prevRoot.agents?.[a]) agentsAdded.push(`root/${a}`);
    else if (prevRoot.agents[a].mtime !== currRoot.agents[a].mtime || prevRoot.agents[a].size !== currRoot.agents[a].size) {
      agentsModified.push(`root/${a}`);
    }
  }
  for (const a of Object.keys(prevRoot.agents || {})) {
    if (!currRoot.agents?.[a]) agentsRemoved.push(`root/${a}`);
  }

  const mcpModified = JSON.stringify(prevRoot.mcp) !== JSON.stringify(currRoot.mcp);
  const hooksModified = JSON.stringify(prevRoot.hooks) !== JSON.stringify(currRoot.hooks);

  const hasChanges =
    pathChanged ||
    pluginsAdded.length > 0 ||
    pluginsRemoved.length > 0 ||
    pluginsModified.length > 0 ||
    skillsAdded.length > 0 ||
    skillsRemoved.length > 0 ||
    skillsModified.length > 0 ||
    rulesAdded.length > 0 ||
    rulesRemoved.length > 0 ||
    rulesModified.length > 0 ||
    agentsAdded.length > 0 ||
    agentsRemoved.length > 0 ||
    agentsModified.length > 0 ||
    mcpModified ||
    hooksModified;

  // Build human-readable summary
  const parts = [];
  if (pathChanged) parts.push(`storage path changed to ${current.hubRoot}`);
  if (pluginsAdded.length) parts.push(`${pluginsAdded.length} plugin(s) added (${pluginsAdded.join(", ")})`);
  if (pluginsRemoved.length) parts.push(`${pluginsRemoved.length} plugin(s) removed (${pluginsRemoved.join(", ")})`);
  if (skillsAdded.length) parts.push(`${skillsAdded.length} skill(s) added`);
  if (skillsRemoved.length) parts.push(`${skillsRemoved.length} skill(s) removed`);
  if (skillsModified.length) parts.push(`${skillsModified.length} skill(s) modified`);
  if (rulesAdded.length || rulesModified.length || rulesRemoved.length) parts.push("rules modified");
  if (agentsAdded.length || agentsModified.length || agentsRemoved.length) parts.push("agents modified");
  if (mcpModified) parts.push("MCP config modified");
  if (hooksModified) parts.push("hooks modified");

  const summary = parts.length > 0 ? parts.join(", ") : "No component changes detected";

  return {
    hasChanges,
    isInitial: false,
    pathChanged,
    pluginsAdded,
    pluginsRemoved,
    pluginsModified,
    skillsAdded,
    skillsRemoved,
    skillsModified,
    rulesAdded,
    rulesRemoved,
    rulesModified,
    agentsAdded,
    agentsRemoved,
    agentsModified,
    mcpModified,
    hooksModified,
    summary,
  };
}

/**
 * Checks for modification differences in the Components Storage Path against the persisted snapshot.
 */
export function checkComponentsModifications(hubRoot = resolveHubRoot()) {
  const cleanHub = getEffectiveHubRoot(hubRoot);
  const currentSnapshot = getComponentsStorageSnapshot(cleanHub);
  const prevSnapshot = loadComponentsStorageSnapshot(cleanHub);
  const diff = diffComponentsStorageSnapshots(prevSnapshot, currentSnapshot);

  return {
    hubRoot: cleanHub,
    hasChanges: diff.hasChanges,
    diff,
    currentSnapshot,
    prevSnapshot,
  };
}

/**
 * Universal startup check & auto-reconnect function:
 * Checks for any modification differences in the Components Storage Path on startup,
 * and if differences are detected (or forced), automatically reconnects / re-synchronizes
 * all configured connected agents.
 */
export function checkAndAutoReconnectOnStartup(customHubConfig = null, options = {}) {
  const cfg = customHubConfig || loadHubConfig();
  const effHub = getEffectiveHubRoot(cfg);
  const { force = false } = options;

  const currentSnapshot = getComponentsStorageSnapshot(effHub);
  const prevSnapshot = loadComponentsStorageSnapshot(effHub);
  const diff = diffComponentsStorageSnapshots(prevSnapshot, currentSnapshot);

  // If force is requested or component modifications were detected, auto-reconnect connected agents!
  if (diff.hasChanges || force) {
    const plugins = scanPlugins(effHub);
    const categories = buildCategoriesRegistry(plugins, effHub);
    const syncRes = syncAllIdes(cfg, plugins);
    const postSyncSnapshot = getComponentsStorageSnapshot(effHub);
    saveComponentsStorageSnapshot(effHub, postSyncSnapshot);

    const connectedAgents = (cfg.ides || []).filter((i) => i.enabled !== false).map((i) => i.name || i.id);

    return {
      success: true,
      startup: true,
      hasChanges: diff.hasChanges,
      autoReconnected: true,
      hubRoot: effHub,
      diff,
      connectedAgentsCount: connectedAgents.length,
      connectedAgents,
      sync: syncRes,
      summary: diff.summary,
    };
  }

  return {
    success: true,
    startup: true,
    hasChanges: false,
    autoReconnected: false,
    hubRoot: effHub,
    diff,
    connectedAgentsCount: (cfg.ides || []).filter((i) => i.enabled !== false).length,
    connectedAgents: (cfg.ides || []).filter((i) => i.enabled !== false).map((i) => i.name || i.id),
    summary: diff.summary,
  };
}

/**
 * Evaluates whether a component / plugin is workable in a given connected agent (IDE),
 * determining the status dot color (green vs red) and detecting `@` mention or `/` slash quick actions.
 */
export function evaluateComponentAgentWorkability(plugin, ide, options = {}) {
  if (!plugin) {
    return {
      workable: false,
      color: "red",
      status: "failed",
      quickActions: { slashCommands: [], mentions: [], hasSlash: false, hasMention: false, hasMcp: false, hasRules: false },
      summary: "No component provided",
      tooltip: "🔴 Error: No component provided",
      reason: "No component provided",
    };
  }

  if (!ide) {
    return {
      workable: false,
      color: "red",
      status: "failed",
      quickActions: { slashCommands: [], mentions: [], hasSlash: false, hasMention: false, hasMcp: false, hasRules: false },
      summary: "No connected agent selected",
      tooltip: "🔴 Connection failed: No connected agent selected. Click an agent on the left to inspect workability.",
      reason: "No connected agent selected",
    };
  }

  // 1. Agent disabled in settings
  if (ide.enabled === false) {
    return {
      workable: false,
      color: "red",
      status: "disabled",
      quickActions: { slashCommands: [], mentions: [], hasSlash: false, hasMention: false, hasMcp: false, hasRules: false },
      summary: `Agent "${ide.name || ide.id}" is disabled`,
      tooltip: `🔴 Connection failed: Agent "${ide.name || ide.id}" is disabled in settings`,
      reason: `Agent "${ide.name || ide.id}" is disabled in settings`,
    };
  }

  // 2. Agent target configuration / link path missing
  const configPath = ide.configPath || (ide.componentPaths && (ide.componentPaths.skills || ide.componentPaths.bundle));
  if (!configPath || String(configPath).trim() === "") {
    return {
      workable: false,
      color: "red",
      status: "failed",
      quickActions: { slashCommands: [], mentions: [], hasSlash: false, hasMention: false, hasMcp: false, hasRules: false },
      summary: `Agent "${ide.name || ide.id}" has no configuration path`,
      tooltip: `🔴 Connection failed: Target link path for "${ide.name || ide.id}" is not configured`,
      reason: `Target link path for "${ide.name || ide.id}" is not configured`,
    };
  }

  // 3. Component toggled OFF / unselected for this specific agent (default is disabled/unselected)
  const isEnabled = Boolean(ide.plugins && ide.plugins[plugin.id] === true);
  if (!isEnabled) {
    return {
      workable: false,
      color: "red",
      status: "disabled",
      quickActions: { slashCommands: [], mentions: [], hasSlash: false, hasMention: false, hasMcp: false, hasRules: false },
      summary: `Disabled for ${ide.name || ide.id}`,
      tooltip: `🔴 Connection failed / Disabled: Component is toggled OFF for "${ide.name || ide.id}". Turn on toggle switch to connect.`,
      reason: `Component is toggled OFF for "${ide.name || ide.id}"`,
    };
  }

  // 4. Sync error check if provided in options
  if (options.lastSync && options.lastSync.success === false) {
    const errMsg = options.lastSync.error || options.lastSync.message || "Sync error";
    return {
      workable: false,
      color: "red",
      status: "failed",
      quickActions: { slashCommands: [], mentions: [], hasSlash: false, hasMention: false, hasMcp: false, hasRules: false },
      summary: `Connection failed: ${errMsg}`,
      tooltip: `🔴 Connection failed to "${ide.name || ide.id}": ${errMsg}`,
      reason: errMsg,
    };
  }

  // 5. Inspect quick action capabilities:
  // Skills -> `/` quick action
  const rawSkills = Array.isArray(plugin.skills) ? plugin.skills : [];
  const slashCommands = rawSkills.map((s) => (typeof s === "string" ? `/${s}` : `/${s.name}`));
  const hasSlash = slashCommands.length > 0;

  // Subagents -> `@` mention quick action
  const rawAgents = Array.isArray(plugin.agents) ? plugin.agents : [];
  const mentions = rawAgents.map((a) => {
    const rawName = typeof a === "string" ? a : a.name || "";
    return `@${rawName.replace(/\.md$/i, "")}`;
  });
  const hasMention = mentions.length > 0;

  const hasMcp = Boolean(plugin.hasMcp || (plugin.mcps && plugin.mcps.length > 0));
  const hasRules = Boolean(plugin.rules && plugin.rules.length > 0);
  const hasHooks = Boolean(plugin.hasHooks || (plugin.hooks && plugin.hooks.length > 0));

  const hasAnyFeature = hasSlash || hasMention || hasMcp || hasRules || hasHooks || (plugin.filesCount && plugin.filesCount > 0);
  if (!hasAnyFeature && !plugin.path) {
    return {
      workable: false,
      color: "red",
      status: "failed",
      quickActions: { slashCommands: [], mentions: [], hasSlash: false, hasMention: false, hasMcp: false, hasRules: false },
      summary: "Empty component (no skills, MCP, rules, or agents found)",
      tooltip: `🔴 Connection failed: No workable components discovered in "${plugin.name || plugin.id}"`,
      reason: "No workable components discovered in plugin",
    };
  }

  // Green dot! Workable in connected agent
  const actionParts = [];
  if (hasSlash) actionParts.push(`Quick action: ${slashCommands.join(" ")}`);
  if (hasMention) actionParts.push(`Quick action: ${mentions.join(" ")}`);
  if (hasMcp) actionParts.push(`MCP tools active`);
  if (hasRules) actionParts.push(`Rules active`);
  if (hasHooks) actionParts.push(`Hooks active`);

  const summary = `Workable in ${ide.name || ide.id}${actionParts.length > 0 ? " · " + actionParts.join(" · ") : ""}`;
  const tooltip = `🟢 Workable in ${ide.name || ide.id}: Connected & ready.${actionParts.length > 0 ? " Can be used with " + actionParts.join(" | ") : ""}`;

  return {
    workable: true,
    color: "green",
    status: "workable",
    quickActions: {
      slashCommands,
      mentions,
      hasSlash,
      hasMention,
      hasMcp,
      hasRules,
    },
    summary,
    tooltip,
    reason: "",
  };
}
