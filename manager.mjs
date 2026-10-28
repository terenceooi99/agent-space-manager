// D:\Software\Magpie\agent-space-manager\manager.mjs
// Central Agent Space Management Engine for Magpie
// Cross-platform, zero-hardcoded path detection for open-source GitHub distribution.

import fs from "fs";
import path from "path";
import os from "os";
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
 * Saves hub configuration to file (UTF-8 without BOM)
 */
export function saveHubConfig(config, configFile = null) {
  const effectiveFile = configFile || path.join(resolveHubRoot(), "hub-config.json");
  if (config && Array.isArray(config.ides)) {
    config.ides = config.ides.map(normalizeIdeEntry);
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
          results.push({ name: e.name, relPath: rel, size: stats.size });
        } catch {
          results.push({ name: e.name, relPath: rel, size: 0 });
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
          const parsed = JSON.parse(content);
          if (parsed && typeof parsed === "object" && !parsed.id) {
            fs.unlinkSync(p);
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
      const isEnabled = normalized.plugins ? normalized.plugins[plugin.id] !== false : true;
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

  return { success: true, results: syncResults, projectResults };
}
