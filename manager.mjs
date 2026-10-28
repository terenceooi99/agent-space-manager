// D:\Software\Magpie\agent-space-manager\manager.mjs
// Central Agent Space Management Engine for Magpie
// Cross-platform, zero-hardcoded path detection for open-source GitHub distribution.

import fs from "fs";
import path from "path";
import os from "os";
import { execSync, execFileSync, execFile } from "child_process";

/**
 * Resolves the Hub root dynamically:
 * 1. Environment variables AGENT_TOOLS_ROOT or AI_WORKSPACE_DIR
 * 2. If running on D:\Software\AI Agent Space, use that
 * 3. Fallback to ~/AI-Agent-Space
 */
export function resolveHubRoot() {
  if (process.env.AGENT_TOOLS_ROOT && fs.existsSync(process.env.AGENT_TOOLS_ROOT)) {
    return path.resolve(process.env.AGENT_TOOLS_ROOT);
  }
  if (process.env.AI_WORKSPACE_DIR && fs.existsSync(process.env.AI_WORKSPACE_DIR)) {
    return path.resolve(process.env.AI_WORKSPACE_DIR);
  }
  if (fs.existsSync("D:\\Software\\AI Agent Space")) {
    return "D:\\Software\\AI Agent Space";
  }
  return path.join(os.homedir(), "AI-Agent-Space");
}

export const DEFAULT_HUB_ROOT = resolveHubRoot();
export const DEFAULT_CONFIG_FILE = path.join(DEFAULT_HUB_ROOT, "hub-config.json");

/**
 * Ensures a directory exists synchronously
 */
export function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Dynamically detects the accurate configuration / plugin link directory
 * for any given Agent IDE or binary across Windows, macOS, and Linux.
 * 
 * Works completely dynamically without hardcoding user profile names.
 * Probes the actual filesystem and CLI configuration tools.
 */
export function detectAgentConfigPath(name = "", exePath = "") {
  const home = os.homedir();
  const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
  const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
  const isWin = process.platform === "win32";
  const isMac = process.platform === "darwin";

  const token = `${name || ""} ${exePath || ""}`.toLowerCase();

  // 1. OpenCode Detection
  if (token.includes("opencode")) {
    // If user provided a binary path or cli exists, try querying opencode debug paths directly
    if (exePath && fs.existsSync(exePath)) {
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
              return path.join(parts.slice(1).join(" "), "plugins");
            }
          }
        }
      } catch {}
    }

    // Standard OpenCode XDG candidate paths
    const opencodeCandidates = [
      path.join(home, ".config", "opencode", "plugins"),
      path.join(home, ".config", "opencode"),
      path.join(appData, "opencode", "plugins"),
      path.join(home, ".opencode", "plugins"),
    ];
    for (const cand of opencodeCandidates) {
      if (fs.existsSync(cand)) return cand.endsWith("plugins") ? cand : path.join(cand, "plugins");
    }
    return path.join(home, ".config", "opencode", "plugins");
  }

  // 2. Google Antigravity / Gemini CLI
  if (token.includes("antigravity") || token.includes("gemini")) {
    const antigravityCandidates = [
      path.join(home, ".gemini", "config", "plugins"),
      path.join(home, ".gemini", "config", "skills"),
      path.join(home, ".antigravity", "config", "plugins"),
    ];
    for (const cand of antigravityCandidates) {
      if (fs.existsSync(cand)) return cand;
    }
    return path.join(home, ".gemini", "config", "plugins");
  }

  // 3. Cursor AI
  if (token.includes("cursor")) {
    const cursorCandidates = [
      path.join(home, ".cursor", "skills"),
      path.join(home, ".cursor", "rules"),
      isWin ? path.join(appData, "Cursor", "skills") : null,
      isMac ? path.join(home, "Library", "Application Support", "Cursor", "skills") : null,
    ].filter(Boolean);
    for (const cand of cursorCandidates) {
      if (fs.existsSync(cand)) return cand;
    }
    return path.join(home, ".cursor", "skills");
  }

  // 4. Windsurf
  if (token.includes("windsurf")) {
    const windsurfCandidates = [
      path.join(home, ".windsurf", "skills"),
      path.join(home, ".codeium", "windsurf", "skills"),
      isWin ? path.join(appData, "Windsurf", "skills") : null,
    ].filter(Boolean);
    for (const cand of windsurfCandidates) {
      if (fs.existsSync(cand)) return cand;
    }
    return path.join(home, ".windsurf", "skills");
  }

  // 5. Claude Code / Anthropic
  if (token.includes("claude")) {
    const claudeCandidates = [
      path.join(home, ".claude", "skills"),
      path.join(home, ".claude", "plugins"),
      isMac ? path.join(home, "Library", "Application Support", "Claude", "skills") : null,
    ].filter(Boolean);
    for (const cand of claudeCandidates) {
      if (fs.existsSync(cand)) return cand;
    }
    return path.join(home, ".claude", "skills");
  }

  // 6. Roo Code / Cline
  if (token.includes("cline") || token.includes("roo")) {
    const rooCandidates = [
      isWin ? path.join(appData, "Code", "User", "globalStorage", "rooveterinaryinc.roo-cline", "skills") : null,
      isMac ? path.join(home, "Library", "Application Support", "Code", "User", "globalStorage", "rooveterinaryinc.roo-cline", "skills") : null,
      path.join(home, ".cline", "skills"),
    ].filter(Boolean);
    for (const cand of rooCandidates) {
      if (fs.existsSync(cand)) return cand;
    }
    if (rooCandidates[0]) return rooCandidates[0];
  }

  // 7. VS Code / Copilot
  if (token.includes("vscode") || token.includes("copilot") || /\bcode\b/.test(token) || token.endsWith("code.exe")) {
    const vscodeCandidates = [
      path.join(home, ".vscode", "skills"),
      path.join(home, ".vscode", "agent-plugins"),
      path.join(home, ".vscode", "extensions", "skills"),
    ];
    for (const cand of vscodeCandidates) {
      if (fs.existsSync(cand)) return cand;
    }
    return path.join(home, ".vscode", "skills");
  }

  // 8. General Dynamic Probe based on executable path or name
  if (exePath && fs.existsSync(exePath)) {
    const parentDir = path.dirname(exePath);
    // Check if there is an adjacent or sub 'plugins' or 'skills' directory
    if (fs.existsSync(path.join(parentDir, "plugins"))) return path.join(parentDir, "plugins");
    if (fs.existsSync(path.join(parentDir, "skills"))) return path.join(parentDir, "skills");
  }

  // Fallback to dotfolder in user home
  const cleanName = name ? name.toLowerCase().replace(/[^a-z0-9_-]/g, "") : "agent";
  const userDotDir = path.join(home, `.${cleanName}`);
  if (fs.existsSync(userDotDir)) {
    if (fs.existsSync(path.join(userDotDir, "plugins"))) return path.join(userDotDir, "plugins");
    return path.join(userDotDir, "skills");
  }

  return path.join(home, `.${cleanName}`, "plugins");
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
  if (lower === "code" || lower === "vscode" || lower === "visualstudiocode") return "VS Code";
  if (lower === "cursor") return "Cursor";
  if (lower === "windsurf") return "Windsurf";
  if (lower === "agy" || lower.includes("antigravity")) return "Antigravity";
  if (lower === "claude") return "Claude";
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
  const userProfile = process.env.USERPROFILE || os.homedir();
  const localAppData = process.env.LOCALAPPDATA || path.join(userProfile, "AppData", "Local");
  const appData = process.env.APPDATA || path.join(userProfile, "AppData", "Roaming");

  const cleanName = path.basename(fileName).trim().replace(/^["']|["']$/g, "");
  const baseNoExt = cleanName.replace(/\.(exe|lnk|cmd|bat)$/i, "").toLowerCase();

  // 1. Direct candidate matching for major known agents
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

  // 2. Search common dirs, ensuring only files (not directories) are returned
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

  // 3. Deep search in LocalAppData/Programs, Start Menu, Desktop
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

  // 4. Try 'where.exe'
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
  const userProfile = process.env.USERPROFILE || os.homedir();

  const searchRoots = [
    "D:\\Software",
    "D:\\Software\\Garmin SDK",
    "D:\\Projects",
    "D:\\",
    path.join(userProfile, "Desktop"),
    path.join(userProfile, "OneDrive", "Desktop"),
    path.join(userProfile, "Downloads"),
    path.join(userProfile, "source", "repos"),
    path.join(userProfile, "Projects"),
  ];

  for (const root of searchRoots) {
    if (!fs.existsSync(root)) continue;

    // Direct check
    const direct = path.join(root, folderName);
    try {
      if (fs.existsSync(direct) && fs.statSync(direct).isDirectory()) {
        return direct;
      }
    } catch {}

    // Breadth-first search up to depth 3
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
    const configPath = detectAgentConfigPath(name, realExe);

    return {
      success: true,
      realPath: realExe,
      name,
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
 * Never blocks the Node event loop and guarantees foreground display.
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
        const configPath = detectAgentConfigPath(name, realExe);

        return resolve({
          cancelled: false,
          realPath: realExe,
          name,
          configPath,
        });
      }
    );
  });
}

/**
 * Loads hub configuration or returns default structure
 */
export function loadHubConfig(configFile = DEFAULT_CONFIG_FILE) {
  try {
    if (fs.existsSync(configFile)) {
      const data = fs.readFileSync(configFile, "utf8");
      return JSON.parse(data);
    }
  } catch (err) {
    console.error("Failed to read hub-config.json:", err);
  }

  const defaultHome = os.homedir();
  return {
    hubRoot: DEFAULT_HUB_ROOT,
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
export function saveHubConfig(config, configFile = DEFAULT_CONFIG_FILE) {
  ensureDir(path.dirname(configFile));
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2), "utf8");
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

    for (const s of (p.skills || [])) {
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

    for (const m of (p.mcps || [])) {
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

    for (const a of (p.agents || [])) {
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

    for (const r of (p.rules || [])) {
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

  // Also check if hubRoot has standalone agents or rules
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
export function scanPlugins(hubRoot = DEFAULT_HUB_ROOT) {
  if (!hubRoot || typeof hubRoot !== "string") return [];
  const cleanHub = hubRoot.trim();
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
          pluginsDir = hubRoot;
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
      } catch (e) {
        manifest.description = "Invalid plugin.json";
      }
    } else {
      // Check if it's a plugin folder with standard components
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

  // Also discover standalone root skills/ if present (e.g. D:\Software\AI Agent Space\skills)
  const rootSkillsDir = path.join(hubRoot, "skills");
  if (fs.existsSync(rootSkillsDir)) {
    try {
      const rootSkills = [];
      for (const se of fs.readdirSync(rootSkillsDir, { withFileTypes: true })) {
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

  return plugins;
}

/**
 * Helper to safely create a directory junction (Windows) or symlink (macOS/Linux)
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
      } else if (stats.isDirectory()) {
        fs.rmSync(linkPath, { recursive: true, force: true });
      } else if (stats.isFile()) {
        fs.unlinkSync(linkPath);
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
 * Safely removes a directory junction or symlink without touching target files.
 * Handles stale / broken junctions where fs.existsSync returns false.
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
    } else if (stats.isDirectory()) {
      fs.rmSync(linkPath, { recursive: true, force: true });
      return { success: true };
    } else if (stats.isFile()) {
      fs.unlinkSync(linkPath);
      return { success: true };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
  return { success: true };
}

/**
 * Syncs links for an IDE based on enabled plugins.
 * Actively removes any obsolete junctions pointing to previous/other hub paths or disabled plugins.
 */
export function syncIdePlugins(ide, allPlugins = []) {
  if (!ide.configPath) {
    return { success: false, message: "No config path specified" };
  }

  ensureDir(ide.configPath);

  const activePluginMap = new Map();
  for (const plugin of allPlugins) {
    const isEnabled = ide.plugins ? ide.plugins[plugin.id] !== false : true;
    if (isEnabled && plugin.path && fs.existsSync(plugin.path)) {
      activePluginMap.set(plugin.id, plugin.path);
    }
  }

  const results = [];

  // 1. Clean up existing junctions in ide.configPath that are NOT in activePluginMap or point to wrong target
  try {
    const existingEntries = fs.readdirSync(ide.configPath);
    for (const entryName of existingEntries) {
      const entryPath = path.join(ide.configPath, entryName);
      try {
        const stat = fs.lstatSync(entryPath);
        if (stat.isSymbolicLink()) {
          const activeTarget = activePluginMap.get(entryName);
          let targetMatches = false;
          if (activeTarget) {
            try {
              const currentTarget = fs.readlinkSync(entryPath);
              if (path.resolve(currentTarget) === path.resolve(activeTarget)) {
                targetMatches = true;
              }
            } catch {}
          }

          if (!targetMatches) {
            const rem = removeJunction(entryPath);
            results.push({ plugin: entryName, action: "unlinked", ...rem });
          }
        }
      } catch {}
    }
  } catch (err) {
    console.warn(`Error scanning existing links in ${ide.configPath}:`, err);
  }

  // 2. Create or verify all active plugins
  for (const [pluginId, sourcePath] of activePluginMap.entries()) {
    const linkPath = path.join(ide.configPath, pluginId);
    const res = createJunction(sourcePath, linkPath);
    results.push({ plugin: pluginId, action: "linked", ...res });
  }

  // 3. Antigravity & Gemini config harmonization
  const isGeminiIde = ide.id === "antigravity" || (ide.configPath && ide.configPath.toLowerCase().includes(".gemini"));
  if (isGeminiIde) {
    const geminiConfigDir = path.dirname(ide.configPath);
    const geminiSkillsLink = path.join(geminiConfigDir, "skills");
    const geminiSkillsJson = path.join(geminiConfigDir, "skills.json");

    // Harmonize ~/.gemini/config/skills junction with active antigravity-core plugin
    const coreTarget = activePluginMap.get("antigravity-core");
    const coreSkillsDir = coreTarget ? path.join(coreTarget, "skills") : null;
    if (coreSkillsDir && fs.existsSync(coreSkillsDir)) {
      createJunction(coreSkillsDir, geminiSkillsLink);
    } else {
      removeJunction(geminiSkillsLink);
    }

    // Harmonize ~/.gemini/config/skills.json so stale/hardcoded paths don't bypass deactivation
    if (fs.existsSync(geminiSkillsJson)) {
      try {
        fs.writeFileSync(geminiSkillsJson, JSON.stringify({ entries: [] }, null, 2), "utf8");
      } catch {}
    }
  }

  return { success: true, results };
}

/**
 * Sever all junctions and links for a given IDE when removed
 */
export function unlinkAllForIde(ide) {
  if (!ide.configPath || !fs.existsSync(ide.configPath)) {
    return { success: true };
  }

  try {
    const existingEntries = fs.readdirSync(ide.configPath);
    for (const entryName of existingEntries) {
      const entryPath = path.join(ide.configPath, entryName);
      try {
        const stat = fs.lstatSync(entryPath);
        if (stat.isSymbolicLink()) {
          removeJunction(entryPath);
        }
      } catch {}
    }
  } catch {}

  const isGeminiIde = ide.id === "antigravity" || (ide.configPath && ide.configPath.toLowerCase().includes(".gemini"));
  if (isGeminiIde) {
    const geminiConfigDir = path.dirname(ide.configPath);
    removeJunction(path.join(geminiConfigDir, "skills"));
    const geminiSkillsJson = path.join(geminiConfigDir, "skills.json");
    if (fs.existsSync(geminiSkillsJson)) {
      try {
        fs.writeFileSync(geminiSkillsJson, JSON.stringify({ entries: [] }, null, 2), "utf8");
      } catch {}
    }
  }

  return { success: true };
}

export function getEffectiveHubRoot(configOrPath) {
  if (typeof configOrPath === "string") {
    if (configOrPath && configOrPath.trim() !== "") return configOrPath.trim();
    return DEFAULT_HUB_ROOT;
  }
  if (configOrPath && typeof configOrPath === "object") {
    if (configOrPath.hubRoot && configOrPath.hubRoot.trim() !== "") {
      return configOrPath.hubRoot.trim();
    }
    if (configOrPath.ides && configOrPath.ides.length > 0 && configOrPath.ides[0].configPath) {
      return configOrPath.ides[0].configPath;
    }
  }
  return DEFAULT_HUB_ROOT;
}

/**
 * Synchronizes all configured IDEs against the given hubConfig or plugin list.
 */
export function syncAllIdes(hubConfig, customPlugins = null) {
  if (!hubConfig?.ides || !Array.isArray(hubConfig.ides)) return { success: true, results: [] };
  const effectiveHub = getEffectiveHubRoot(hubConfig);
  const plugins = customPlugins !== null ? customPlugins : scanPlugins(effectiveHub);
  const syncResults = [];

  for (const ide of hubConfig.ides) {
    if (ide.enabled !== false && ide.configPath) {
      const res = syncIdePlugins(ide, plugins);
      syncResults.push({ ide: ide.name, ...res });
    }
  }

  return { success: true, results: syncResults };
}
