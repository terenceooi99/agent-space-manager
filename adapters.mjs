// adapters.mjs
// Native-format component adapters & ownership manifest manager.
// Guarantees non-destructive syncs:
// 1. Creates a `.asm-bak` backup before modifying any existing user-owned config file.
// 2. Tracks every junction, file copy, JSON key, and Markdown/TOML block in `.asm-state/<id>.json`.
// 3. Only prunes items that Agent Space Manager itself created (or legacy junctions pointing inside hubRoot).

import fs from "node:fs";
import path from "node:path";
import {
  getHomeDir,
  resolveEffectiveAgentPaths,
  resolveEffectiveProjectPaths,
} from "./agents.mjs";

const BLOCK_START_MD = "<!-- agent-space-manager:start -->";
const BLOCK_END_MD = "<!-- agent-space-manager:end -->";
const BLOCK_START_TOML = "# >>> agent-space-manager";
const BLOCK_END_TOML = "# <<< agent-space-manager";

export function ensureDir(dirPath) {
  if (dirPath && !fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function getStateDir() {
  const dir = path.join(getHomeDir(), ".agent-space-manager", "state");
  ensureDir(dir);
  return dir;
}

export function getStateFilePath(ownerId) {
  const safeId = String(ownerId || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
  return path.join(getStateDir(), `${safeId}.json`);
}

export function loadOwnershipState(ownerId) {
  const file = getStateFilePath(ownerId);
  try {
    if (fs.existsSync(file)) {
      const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
      return {
        meta: parsed.meta && typeof parsed.meta === "object" ? parsed.meta : null,
        links: Array.isArray(parsed.links) ? parsed.links : [],
        files: Array.isArray(parsed.files) ? parsed.files : [],
        jsonKeys: parsed.jsonKeys && typeof parsed.jsonKeys === "object" ? parsed.jsonKeys : {},
        blocks: Array.isArray(parsed.blocks) ? parsed.blocks : [],
      };
    }
  } catch {}
  return { meta: null, links: [], files: [], jsonKeys: {}, blocks: [] };
}

export function saveOwnershipState(ownerId, state) {
  const file = getStateFilePath(ownerId);
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(state, null, 2), "utf8");
}

export function deleteOwnershipState(ownerId) {
  const file = getStateFilePath(ownerId);
  try {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
      return true;
    }
  } catch {}
  return false;
}

export function listAllOwnershipStates() {
  const dir = getStateDir();
  const results = [];
  try {
    if (fs.existsSync(dir)) {
      for (const name of fs.readdirSync(dir)) {
        if (name.endsWith(".json")) {
          const ownerId = name.slice(0, -5);
          const state = loadOwnershipState(ownerId);
          results.push({ ownerId, file: path.join(dir, name), ...state });
        }
      }
    }
  } catch {}
  return results;
}

export function ensureBackupOnce(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const bak = `${filePath}.asm-bak`;
      if (!fs.existsSync(bak)) {
        fs.copyFileSync(filePath, bak);
      }
    }
  } catch {}
}

/**
 * Extracts simple YAML frontmatter key/values (e.g. name, description) and Markdown body.
 */
export function parseMarkdownFrontmatter(raw = "") {
  const text = String(raw || "");
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) {
    return { frontmatter: {}, body: text.trim() };
  }
  const yamlBlock = m[1];
  const body = m[2].trim();
  const fm = {};
  for (const line of yamlBlock.split(/\r?\n/)) {
    const kv = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.+)$/);
    if (kv) {
      const key = kv[1];
      let val = kv[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      fm[key] = val;
    }
  }
  return { frontmatter: fm, body };
}

/**
 * Checks whether a target path is located inside any known hub path or plugin source path.
 */
export function isTargetInsideHub(targetPath, activePlugins = [], hubRoot = "") {
  if (!targetPath) return false;
  const resolved = path.resolve(targetPath).toLowerCase();
  if (hubRoot) {
    const hubRes = path.resolve(hubRoot).toLowerCase();
    if (resolved.startsWith(hubRes)) return true;
  }
  for (const p of activePlugins) {
    if (p.path) {
      const pRes = path.resolve(p.path).toLowerCase();
      const parentRes = path.dirname(pRes).toLowerCase();
      if (resolved.startsWith(pRes) || resolved.startsWith(parentRes)) return true;
    }
  }
  if (resolved.includes("ai agent space") || resolved.includes("ai-agent-space")) {
    return true;
  }
  return false;
}

/**
 * Collects all enabled skills, MCP server configs, rules, subagents, and hooks from the active plugin list.
 */
export function collectEnabledComponents(allPlugins = [], enabledMap = {}) {
  const skills = []; // { name, sourceDir, pluginId }
  const seenSkills = new Set();
  const mcpServers = {}; // { [serverName]: serverDef }
  const rules = []; // { name, sourceFile, pluginId }
  const seenRules = new Set();
  const agents = []; // { name, sourceFile, pluginId }
  const seenAgents = new Set();
  const hooks = []; // { id, def, pluginId }
  const seenHooks = new Set();
  const conflicts = [];

  for (const plugin of allPlugins) {
    const isEnabled = enabledMap ? enabledMap[plugin.id] !== false : true;
    if (!isEnabled || !plugin.path || !fs.existsSync(plugin.path)) continue;

    // 1. Skills
    for (const sName of plugin.skills || []) {
      const skillDir = plugin.isRootSkills
        ? path.join(plugin.path, sName)
        : path.join(plugin.path, "skills", sName);
      if (!fs.existsSync(skillDir)) continue;
      if (seenSkills.has(sName)) {
        conflicts.push({ type: "skill", name: sName, pluginId: plugin.id, reason: "duplicate skill name" });
        continue;
      }
      seenSkills.add(sName);
      skills.push({ name: sName, sourceDir: skillDir, pluginId: plugin.id });
    }

    // 2. MCP Servers
    const mcpFile = path.join(plugin.path, "mcp_config.json");
    if (plugin.hasMcp && fs.existsSync(mcpFile)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(mcpFile, "utf8"));
        const servers = parsed.mcpServers || parsed.servers || {};
        for (const [srvName, srvDef] of Object.entries(servers)) {
          if (srvDef && typeof srvDef === "object") {
            mcpServers[srvName] = srvDef;
          }
        }
      } catch {}
    }

    // 3. Rules
    const rulesDir = path.join(plugin.path, "rules");
    for (const rName of plugin.rules || []) {
      const ruleFile = path.join(rulesDir, rName);
      if (fs.existsSync(ruleFile) && !seenRules.has(rName)) {
        seenRules.add(rName);
        rules.push({ name: rName, sourceFile: ruleFile, pluginId: plugin.id });
      }
    }

    // 4. Subagents
    const agentsDir = path.join(plugin.path, "agents");
    for (const aName of plugin.agents || []) {
      const agentFile = path.join(agentsDir, aName);
      if (fs.existsSync(agentFile) && !seenAgents.has(aName)) {
        seenAgents.add(aName);
        agents.push({ name: aName, sourceFile: agentFile, pluginId: plugin.id });
      }
    }

    // 5. Hooks
    const hooksFile = path.join(plugin.path, "hooks.json");
    if (plugin.hasHooks && fs.existsSync(hooksFile)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(hooksFile, "utf8"));
        const list = Array.isArray(parsed) ? parsed : (parsed.hooks || []);
        for (const h of list) {
          const hId = typeof h === "string" ? h : (h.id || h.name);
          if (hId && !seenHooks.has(hId)) {
            seenHooks.add(hId);
            hooks.push({ id: hId, def: h, pluginId: plugin.id });
          }
        }
      } catch {}
    }
  }

  return { skills, mcpServers, rules, agents, hooks, conflicts };
}

/**
 * Checks whether a directory is managed/owned by Agent Space Manager via .asm-owned.json
 */
export function isAsmOwnedDirectory(dirPath) {
  try {
    return fs.existsSync(path.join(dirPath, ".asm-owned.json"));
  } catch {
    return false;
  }
}

/**
 * Materializes a single skill directory with real top-level files (especially SKILL.md)
 * and child links for subfolders, bypassing Go os.ReadDir Windows junction issues.
 */
export function materializeSkillDir(sourceDir, destDir, ownerId = "asm", createJunctionFn = null) {
  try {
    ensureDir(destDir);
    const markerPath = path.join(destDir, ".asm-owned.json");
    fs.writeFileSync(
      markerPath,
      JSON.stringify({ owner: ownerId, source: sourceDir, type: "skill", updatedAt: Date.now() }, null, 2),
      "utf8"
    );

    const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name === ".asm-owned.json" || ent.name === ".git") continue;
      const srcChild = path.join(sourceDir, ent.name);
      const destChild = path.join(destDir, ent.name);
      if (ent.isFile()) {
        try {
          fs.copyFileSync(srcChild, destChild);
        } catch {}
      } else if (ent.isDirectory()) {
        if (createJunctionFn) {
          createJunctionFn(srcChild, destChild);
        } else {
          try {
            ensureDir(destChild);
          } catch {}
        }
      }
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Materializes a plugin bundle into a real directory containing real top-level files,
 * real skills directory with materialized skill subfolders, and child junctions for subfolders.
 */
export function materializePluginBundle(sourceDir, destDir, ownerId = "asm", createJunctionFn = null) {
  try {
    ensureDir(destDir);
    const markerPath = path.join(destDir, ".asm-owned.json");
    fs.writeFileSync(
      markerPath,
      JSON.stringify({ owner: ownerId, source: sourceDir, type: "plugin", updatedAt: Date.now() }, null, 2),
      "utf8"
    );

    const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
    for (const ent of entries) {
      if (ent.name === ".asm-owned.json" || ent.name === ".git") continue;
      const srcChild = path.join(sourceDir, ent.name);
      const destChild = path.join(destDir, ent.name);

      if (ent.isFile()) {
        try {
          fs.copyFileSync(srcChild, destChild);
        } catch {}
      } else if (ent.isDirectory()) {
        if (ent.name === "skills") {
          ensureDir(destChild);
          try {
            const subSkills = fs.readdirSync(srcChild, { withFileTypes: true });
            for (const sub of subSkills) {
              if (sub.isDirectory() || sub.isSymbolicLink()) {
                const subSrc = path.join(srcChild, sub.name);
                const subDest = path.join(destChild, sub.name);
                materializeSkillDir(subSrc, subDest, ownerId, createJunctionFn);
              }
            }
          } catch {}
        } else if (ent.name === "rules" || ent.name === "agents") {
          ensureDir(destChild);
          try {
            const subFiles = fs.readdirSync(srcChild, { withFileTypes: true });
            for (const sf of subFiles) {
              if (sf.isFile()) {
                fs.copyFileSync(path.join(srcChild, sf.name), path.join(destChild, sf.name));
              }
            }
          } catch {}
        } else {
          if (createJunctionFn) {
            createJunctionFn(srcChild, destChild);
          } else {
            ensureDir(destChild);
          }
        }
      }
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Syncs plugin bundles into primaryDir (e.g. ~/.gemini/config/plugins) using real-directory
 * materialization on Windows with .asm-owned.json markers, while strictly preserving foreign symlinks and folders.
 */
export function syncPluginBundles(
  primaryDir,
  activePluginMap,
  prevLinks = [],
  createJunctionFn = null,
  removeJunctionFn = null,
  allPlugins = [],
  ownerId = "asm"
) {
  ensureDir(primaryDir);
  const bundleLinks = [];
  const results = [];
  const prevLinksSet = new Set((prevLinks || []).map((p) => path.resolve(p)));

  // 1. Prune stale owned junctions or ASM-owned directories
  try {
    const existingEntries = fs.readdirSync(primaryDir);
    for (const entryName of existingEntries) {
      const entryPath = path.join(primaryDir, entryName);
      const resolvedEntry = path.resolve(entryPath);
      try {
        const stat = fs.lstatSync(entryPath);
        if (stat.isSymbolicLink()) {
          let currentTarget = "";
          try {
            currentTarget = fs.readlinkSync(entryPath);
          } catch {}

          const isOwned = prevLinksSet.has(resolvedEntry) || isTargetInsideHub(currentTarget, allPlugins);
          if (!isOwned) continue; // Foreign user symlink — preserve!

          const activeTarget = activePluginMap.get(entryName);
          const targetMatches =
            activeTarget && currentTarget && path.resolve(currentTarget) === path.resolve(activeTarget);
          if (!targetMatches) {
            if (removeJunctionFn) removeJunctionFn(entryPath);
            else {
              try { fs.unlinkSync(entryPath); } catch {}
            }
            results.push({ plugin: entryName, action: "unlinked", success: true });
          }
        } else if (stat.isDirectory()) {
          const isAsmDir = isAsmOwnedDirectory(entryPath) || prevLinksSet.has(resolvedEntry) || isTargetInsideHub(entryPath, allPlugins, resolveHubRoot());
          const hasPluginJson = fs.existsSync(path.join(entryPath, "plugin.json"));
          if ((isAsmDir || !hasPluginJson) && !activePluginMap.has(entryName)) {
            try { fs.rmSync(entryPath, { recursive: true, force: true }); } catch {}
            results.push({ plugin: entryName, action: "unlinked", success: true });
          }
        }
      } catch {}
    }
  } catch {}

  // 2. Materialize or update active plugin bundles
  for (const [pluginId, sourcePath] of activePluginMap.entries()) {
    const linkPath = path.join(primaryDir, pluginId);
    let isSym = false;
    try {
      const st = fs.lstatSync(linkPath);
      isSym = st.isSymbolicLink();
    } catch {}

    if (isSym) {
      if (removeJunctionFn) removeJunctionFn(linkPath);
      else {
        try { fs.unlinkSync(linkPath); } catch {}
      }
    }

    const res = materializePluginBundle(sourcePath, linkPath, ownerId, createJunctionFn);
    if (res.success) {
      bundleLinks.push(path.resolve(linkPath));
    }
    results.push({ plugin: pluginId, action: "linked", ...res });
  }

  return { bundleLinks, results };
}

/**
 * Syncs individual skill directories (<skillsDir>/<skill-name> -> <plugin>/skills/<skill-name>)
 * while preserving user-created skills and non-owned symlinks.
 * Materializes real directories with .asm-owned.json so Go os.ReadDir never skips skills on Windows.
 */
export function syncFlattenedSkills(
  skills,
  skillsDir,
  prevLinks = [],
  createJunctionFn = null,
  removeJunctionFn = null,
  allPlugins = [],
  ownerId = "asm"
) {
  const nextLinks = [];
  const results = [];
  if (!skillsDir) return { nextLinks, results };

  try {
    const dirStat = fs.lstatSync(skillsDir);
    if (dirStat.isSymbolicLink()) {
      if (removeJunctionFn) removeJunctionFn(skillsDir);
      else {
        try { fs.unlinkSync(skillsDir); } catch {}
      }
    }
  } catch {}

  ensureDir(skillsDir);

  const desiredMap = new Map();
  for (const s of skills) {
    desiredMap.set(s.name, s.sourceDir);
  }

  const prevSet = new Set((prevLinks || []).map((p) => path.resolve(p)));

  // 1. Prune previously owned links or ASM-owned directories in skillsDir that are no longer desired
  try {
    const entries = fs.readdirSync(skillsDir);
    for (const entryName of entries) {
      const entryPath = path.join(skillsDir, entryName);
      const resolvedEntry = path.resolve(entryPath);
      try {
        const stat = fs.lstatSync(entryPath);
        if (stat.isSymbolicLink()) {
          let currentTarget = "";
          try {
            currentTarget = fs.readlinkSync(entryPath);
          } catch {}
          const isOwned = prevSet.has(resolvedEntry) || isTargetInsideHub(currentTarget, allPlugins);
          if (!isOwned) continue; // Foreign user symlink — never touch!

          const desiredTarget = desiredMap.get(entryName);
          const matchesDesired =
            desiredTarget && currentTarget && path.resolve(currentTarget) === path.resolve(desiredTarget);
          if (!matchesDesired) {
            if (removeJunctionFn) removeJunctionFn(entryPath);
            else {
              try { fs.unlinkSync(entryPath); } catch {}
            }
            results.push({ skill: entryName, action: "unlinked", success: true });
          }
        } else if (stat.isDirectory()) {
          const isAsmDir = isAsmOwnedDirectory(entryPath) || prevSet.has(resolvedEntry);
          if (isAsmDir && !desiredMap.has(entryName)) {
            fs.rmSync(entryPath, { recursive: true, force: true });
            results.push({ skill: entryName, action: "unlinked", success: true });
          }
        }
      } catch {}
    }
  } catch {}

  // Also clean any prevLinks that lived in a previous skillsDir if configPath changed
  for (const oldLink of prevLinks || []) {
    if (path.dirname(path.resolve(oldLink)) !== path.resolve(skillsDir)) {
      if (removeJunctionFn) removeJunctionFn(oldLink);
      else {
        try {
          if (fs.existsSync(oldLink)) {
            const st = fs.lstatSync(oldLink);
            if (st.isSymbolicLink()) fs.unlinkSync(oldLink);
            else if (isAsmOwnedDirectory(oldLink)) fs.rmSync(oldLink, { recursive: true, force: true });
          }
        } catch {}
      }
    }
  }

  // 2. Create or verify desired skill directories
  for (const [skillName, sourceDir] of desiredMap.entries()) {
    const linkPath = path.join(skillsDir, skillName);
    let isSym = false;
    try {
      const st = fs.lstatSync(linkPath);
      isSym = st.isSymbolicLink();
    } catch {}

    if (isSym) {
      if (removeJunctionFn) removeJunctionFn(linkPath);
      else {
        try { fs.unlinkSync(linkPath); } catch {}
      }
    }

    const res = materializeSkillDir(sourceDir, linkPath, ownerId, createJunctionFn);
    if (res.success) {
      nextLinks.push(path.resolve(linkPath));
    }
    results.push({ skill: skillName, action: "linked", ...res });
  }

  return { nextLinks, results };
}

/**
 * Generates `/` quick-action slash command files (in ~/.config/opencode/commands, ~/.claude/commands,
 * ~/.cursor/commands, ~/.codeium/windsurf/global_workflows, Code/User/prompts, ~/.gemini/commands, etc.)
 * so every enabled skill is immediately available in the agent's `/` autocomplete menu.
 */
export function syncSkillSlashCommands(skills = [], commandsSpec = null, prevOwnedFiles = []) {
  if (!commandsSpec) return { nextFiles: [] };
  const dir = typeof commandsSpec === "string" ? commandsSpec : commandsSpec.dir;
  const suffix = typeof commandsSpec === "object" && commandsSpec.suffix ? commandsSpec.suffix : ".md";
  const format = typeof commandsSpec === "object" && commandsSpec.format ? commandsSpec.format : "markdown-command";
  if (!dir) return { nextFiles: [] };

  const prevSet = new Set((prevOwnedFiles || []).map((f) => path.resolve(f)));
  const nextFiles = [];

  if ((!skills || skills.length === 0) && prevSet.size === 0) {
    return { nextFiles: [] };
  }

  ensureDir(dir);

  const desiredMap = new Map();
  for (const s of skills || []) {
    const destName = `${s.name}${suffix}`;
    const destPath = path.resolve(path.join(dir, destName));
    desiredMap.set(destPath, s);
  }

  // Prune previously owned command files that are no longer enabled
  for (const oldFile of prevSet) {
    if (!desiredMap.has(oldFile)) {
      try {
        if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
      } catch {}
    }
  }

  // Write or update active slash command files
  for (const [destResolved, skill] of desiredMap.entries()) {
    if (fs.existsSync(destResolved) && !prevSet.has(destResolved)) {
      // Check if an existing file was previously generated by us via marker or skip user-owned file
      try {
        const existingContent = fs.readFileSync(destResolved, "utf8");
        if (!existingContent.includes("SKILL.md")) {
          continue; // Respect pre-existing user command file
        }
      } catch {
        continue;
      }
    }

    const skillMdPath = path.join(skill.sourceDir, "SKILL.md");
    let desc = `Execute the ${skill.name} skill`;
    if (fs.existsSync(skillMdPath)) {
      try {
        const raw = fs.readFileSync(skillMdPath, "utf8");
        const { frontmatter } = parseMarkdownFrontmatter(raw);
        if (frontmatter.description) {
          desc = frontmatter.description.replace(/\r?\n/g, " ").trim();
        }
      } catch {}
    }

    const posixSkillFile = skillMdPath.replace(/\\/g, "/");
    let content = "";
    if (format === "gemini-toml-command") {
      content = [
        `description = ${JSON.stringify(desc)}`,
        `prompt = ${JSON.stringify(`Read and follow the skill instructions in ${posixSkillFile} to complete the user's request.\n\n{{args}}`)}`,
        "",
      ].join("\n");
    } else {
      content = [
        "---",
        `description: ${JSON.stringify(desc)}`,
        "---",
        "",
        `Read and follow the skill instructions in \`${posixSkillFile}\` to complete the user's request.`,
        "",
        "$ARGUMENTS",
        "",
      ].join("\n");
    }

    try {
      let needsWrite = true;
      if (fs.existsSync(destResolved)) {
        try {
          if (fs.readFileSync(destResolved, "utf8") === content) {
            needsWrite = false;
          }
        } catch {}
      }
      if (needsWrite) {
        fs.writeFileSync(destResolved, content, "utf8");
      }
      nextFiles.push(destResolved);
    } catch {}
  }

  return { nextFiles };
}

/**
 * Transforms standard MCP server definition to OpenCode's `opencode.json` schema.
 * Supports remote servers (`url`, `serverUrl`, `httpUrl`) and local command servers.
 * Returns `null` if neither a remote URL nor a command is defined.
 */
function toOpenCodeMcpEntry(def) {
  const remoteUrl = def.url || def.serverUrl || def.httpUrl;
  if (remoteUrl) {
    return {
      type: "remote",
      url: remoteUrl,
      enabled: true,
    };
  }
  const cmd = def.command ? [def.command, ...(Array.isArray(def.args) ? def.args : [])] : [];
  if (cmd.length === 0) {
    return null;
  }
  const entry = {
    type: "local",
    command: cmd,
    enabled: true,
  };
  if (def.env && Object.keys(def.env).length > 0) {
    entry.environment = { ...def.env };
  }
  return entry;
}

/**
 * Merges managed MCP servers into a native JSON file (e.g. ~/.claude.json, ~/.cursor/mcp.json,
 * Code/User/mcp.json, opencode.json) while preserving all user-defined keys and servers.
 */
export function syncJsonMcpServers(mcpSpec, mcpServers, prevOwnedKeys = []) {
  if (!mcpSpec || !mcpSpec.file) return { ownedKeys: [] };
  const filePath = mcpSpec.file;
  const rootKey = mcpSpec.key || "mcpServers";
  const isOpenCode = mcpSpec.format === "opencode-json";

  const desiredNames = Object.keys(mcpServers || {});
  if (desiredNames.length === 0 && (!prevOwnedKeys || prevOwnedKeys.length === 0) && !fs.existsSync(filePath)) {
    return { ownedKeys: [] };
  }

  ensureDir(path.dirname(filePath));
  ensureBackupOnce(filePath);

  let doc = {};
  if (fs.existsSync(filePath)) {
    try {
      doc = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (!doc || typeof doc !== "object" || Array.isArray(doc)) doc = {};
    } catch {
      doc = {};
    }
  }

  if (!doc[rootKey] || typeof doc[rootKey] !== "object" || Array.isArray(doc[rootKey])) {
    doc[rootKey] = {};
  }

  const container = doc[rootKey];
  const prevSet = new Set(prevOwnedKeys || []);

  // Remove previously owned keys that are no longer active
  for (const oldKey of prevSet) {
    if (!(oldKey in mcpServers)) {
      delete container[oldKey];
    }
  }

  // When unlinking all, ensure any server pointing to AI Agent Space or hub is cleaned
  if (desiredNames.length === 0) {
    for (const [k, v] of Object.entries(container)) {
      const vStr = JSON.stringify(v || "");
      if (vStr.includes("AI Agent Space") || vStr.includes("agent-space-manager")) {
        delete container[k];
      }
    }
  }

  const nextOwned = [];
  for (const [srvName, srvDef] of Object.entries(mcpServers)) {
    // Only overwrite if key doesn't exist OR was already owned by us
    if (!(srvName in container) || prevSet.has(srvName)) {
      if (isOpenCode) {
        const ocEntry = toOpenCodeMcpEntry(srvDef);
        if (!ocEntry) {
          delete container[srvName];
          continue;
        }
        container[srvName] = ocEntry;
      } else {
        const normalizedDef = { ...srvDef };
        if (!normalizedDef.url && (normalizedDef.serverUrl || normalizedDef.httpUrl)) {
          normalizedDef.url = normalizedDef.serverUrl || normalizedDef.httpUrl;
        }
        container[srvName] = normalizedDef;
      }
      nextOwned.push(srvName);
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(doc, null, 2), "utf8");
  return { ownedKeys: nextOwned };
}

/**
 * Formats a value as a TOML literal.
 */
function toTomlValue(val) {
  if (typeof val === "string") return JSON.stringify(val);
  if (typeof val === "number" || typeof val === "boolean") return String(val);
  if (Array.isArray(val)) return `[${val.map(toTomlValue).join(", ")}]`;
  return JSON.stringify(String(val));
}

/**
 * Syncs managed `[mcp_servers.<name>]` sections into Codex's `config.toml` between marker comments.
 */
export function syncTomlMcpServers(filePath, mcpServers, hadBlockBefore = false) {
  if (!filePath) return { hasBlock: false };
  const entries = Object.entries(mcpServers || {});
  if (entries.length === 0 && !hadBlockBefore && !fs.existsSync(filePath)) {
    return { hasBlock: false };
  }

  ensureDir(path.dirname(filePath));
  ensureBackupOnce(filePath);

  let existing = "";
  if (fs.existsSync(filePath)) {
    try {
      existing = fs.readFileSync(filePath, "utf8");
    } catch {}
  }

  const blockRegex = new RegExp(
    `${escapeRegExp(BLOCK_START_TOML)}[\\s\\S]*?${escapeRegExp(BLOCK_END_TOML)}\\r?\\n?`,
    "g"
  );
  let cleaned = existing.replace(blockRegex, "").trimEnd();

  if (entries.length === 0) {
    if (fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, cleaned ? `${cleaned}\n` : "", "utf8");
    }
    return { hasBlock: false };
  }

  const lines = [BLOCK_START_TOML];
  for (const [rawName, def] of entries) {
    const safeKey = /^[A-Za-z0-9_-]+$/.test(rawName) ? rawName : JSON.stringify(rawName);
    lines.push(`[mcp_servers.${safeKey}]`);
    if (def.command) lines.push(`command = ${toTomlValue(def.command)}`);
    if (Array.isArray(def.args)) lines.push(`args = ${toTomlValue(def.args)}`);
    const remoteUrl = def.url || def.serverUrl || def.httpUrl;
    if (remoteUrl) lines.push(`url = ${toTomlValue(remoteUrl)}`);
    if (def.env && typeof def.env === "object" && Object.keys(def.env).length > 0) {
      lines.push(`[mcp_servers.${safeKey}.env]`);
      for (const [ek, ev] of Object.entries(def.env)) {
        const safeEnvKey = /^[A-Za-z0-9_-]+$/.test(ek) ? ek : JSON.stringify(ek);
        lines.push(`${safeEnvKey} = ${toTomlValue(ev)}`);
      }
    }
    lines.push("");
  }
  lines.push(BLOCK_END_TOML);

  const nextContent = (cleaned ? `${cleaned}\n\n` : "") + lines.join("\n") + "\n";
  fs.writeFileSync(filePath, nextContent, "utf8");
  return { hasBlock: true };
}

/**
 * Syncs a managed Markdown rules block into CLAUDE.md / AGENTS.md / GEMINI.md / global_rules.md.
 */
export function syncMarkdownRulesBlock(rulesSpec, rules, hadBlockBefore = false) {
  if (!rulesSpec || !rulesSpec.file) return { hasBlock: false };
  const filePath = rulesSpec.file;

  if ((!rules || rules.length === 0) && !hadBlockBefore && !fs.existsSync(filePath)) {
    return { hasBlock: false };
  }

  ensureDir(path.dirname(filePath));
  ensureBackupOnce(filePath);

  let existing = "";
  if (fs.existsSync(filePath)) {
    try {
      existing = fs.readFileSync(filePath, "utf8");
    } catch {}
  }

  const blockRegex = new RegExp(
    `${escapeRegExp(BLOCK_START_MD)}[\\s\\S]*?${escapeRegExp(BLOCK_END_MD)}\\r?\\n?`,
    "g"
  );
  const cleaned = existing.replace(blockRegex, "").trimEnd();

  if (!rules || rules.length === 0) {
    if (fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, cleaned ? `${cleaned}\n` : "", "utf8");
    }
    return { hasBlock: false };
  }

  const lines = [BLOCK_START_MD];
  if (rulesSpec.format === "import-block") {
    for (const r of rules) {
      const posixPath = r.sourceFile.replace(/\\/g, "/");
      lines.push(`@${posixPath}`);
    }
  } else {
    for (const r of rules) {
      try {
        const body = fs.readFileSync(r.sourceFile, "utf8").trim();
        lines.push(`<!-- rule: ${r.name} -->\n${body}`);
      } catch {}
    }
  }
  lines.push(BLOCK_END_MD);

  const nextContent = (cleaned ? `${cleaned}\n\n` : "") + lines.join("\n\n") + "\n";
  fs.writeFileSync(filePath, nextContent, "utf8");
  return { hasBlock: true };
}

/**
 * Copies owned single-file components (subagents or directory-based rules) and removes stale owned copies.
 * Normalizes frontmatter when `targetDirSpec.format === "opencode-agent"` so OpenCode's Effect Schema never skips subagents.
 */
export function syncOwnedFiles(items, targetDirSpec, prevOwnedFiles = []) {
  if (!targetDirSpec) return { nextFiles: [] };
  const dir = typeof targetDirSpec === "string" ? targetDirSpec : targetDirSpec.dir;
  const suffix = typeof targetDirSpec === "object" && targetDirSpec.suffix ? targetDirSpec.suffix : ".md";
  const format = typeof targetDirSpec === "object" && targetDirSpec.format ? targetDirSpec.format : "raw";
  if (!dir) return { nextFiles: [] };

  const prevSet = new Set((prevOwnedFiles || []).map((f) => path.resolve(f)));
  const nextFiles = [];

  if ((!items || items.length === 0) && prevSet.size === 0) {
    return { nextFiles: [] };
  }

  ensureDir(dir);

  const desiredPaths = new Map();
  for (const item of items || []) {
    const baseNoExt = item.name.replace(/\.md$/i, "");
    const destName = `${baseNoExt}${suffix}`;
    const destPath = path.join(dir, destName);
    desiredPaths.set(path.resolve(destPath), item.sourceFile);
  }

  // Delete previously owned files that are no longer desired
  for (const oldFile of prevSet) {
    if (!desiredPaths.has(oldFile)) {
      try {
        if (fs.existsSync(oldFile)) fs.unlinkSync(oldFile);
      } catch {}
    }
  }

  // Copy active files (unless a non-owned user file already exists at that path)
  for (const [destResolved, srcFile] of desiredPaths.entries()) {
    if (fs.existsSync(destResolved) && !prevSet.has(destResolved)) {
      continue; // Respect pre-existing user file
    }
    try {
      if (format === "opencode-agent") {
        const raw = fs.readFileSync(srcFile, "utf8");
        const { frontmatter, body } = parseMarkdownFrontmatter(raw);
        const desc = (frontmatter.description || `Subagent ${path.basename(destResolved, suffix)}`)
          .replace(/\r?\n/g, " ")
          .trim();
        const formatted = [
          "---",
          `description: ${JSON.stringify(desc)}`,
          "mode: subagent",
          "---",
          "",
          body,
          "",
        ].join("\n");
        fs.writeFileSync(destResolved, formatted, "utf8");
      } else if (format === "antigravity-rule") {
        const raw = fs.readFileSync(srcFile, "utf8");
        const { frontmatter, body } = parseMarkdownFrontmatter(raw);
        const desc = (frontmatter.description || `Rule ${path.basename(destResolved, suffix)}`)
          .replace(/\r?\n/g, " ")
          .trim();
        const trigger = frontmatter.trigger || "always_on";
        const formatted = [
          "---",
          `description: ${JSON.stringify(desc)}`,
          `trigger: ${trigger}`,
          "---",
          "",
          body,
          "",
        ].join("\n");
        fs.writeFileSync(destResolved, formatted, "utf8");
      } else {
        fs.copyFileSync(srcFile, destResolved);
      }
      nextFiles.push(destResolved);
    } catch {}
  }

  return { nextFiles };
}

/**
 * Adds relative paths to `<repo>/.git/info/exclude` so synced workspace links/files are never committed.
 */
export function ensureGitInfoExclude(repoPath, relPaths = []) {
  if (!repoPath || !relPaths || relPaths.length === 0) return;
  const excludeFile = path.join(repoPath, ".git", "info", "exclude");
  if (!fs.existsSync(path.dirname(excludeFile))) return;
  try {
    let content = fs.existsSync(excludeFile) ? fs.readFileSync(excludeFile, "utf8") : "";
    let changed = false;
    for (const rel of relPaths) {
      const norm = rel.replace(/\\/g, "/");
      if (!content.split(/\r?\n/).some((line) => line.trim() === norm)) {
        if (content && !content.endsWith("\n")) content += "\n";
        content += `${norm}\n`;
        changed = true;
      }
    }
    if (changed) {
      fs.writeFileSync(excludeFile, content, "utf8");
    }
  } catch {}
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Syncs managed hooks into native hooks.json while preserving user-defined hooks.
 */
export function syncJsonHooks(hooksSpec, hooksList = [], prevOwnedKeys = []) {
  if (!hooksSpec || !hooksSpec.file) return { ownedKeys: [] };
  const filePath = hooksSpec.file;
  const desiredKeys = new Set(hooksList.map((h) => (typeof h === "string" ? h : h.id || h.name)));
  if (desiredKeys.size === 0 && (!prevOwnedKeys || prevOwnedKeys.length === 0) && !fs.existsSync(filePath)) {
    return { ownedKeys: [] };
  }

  ensureDir(path.dirname(filePath));
  ensureBackupOnce(filePath);

  let doc = { hooks: {} };
  if (fs.existsSync(filePath)) {
    try {
      doc = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (!doc || typeof doc !== "object") doc = { hooks: {} };
    } catch {
      doc = { hooks: {} };
    }
  }

  if (Array.isArray(doc)) {
    doc = { hooks: doc };
  } else if (!doc.hooks) {
    doc.hooks = {};
  }

  const prevSet = new Set(prevOwnedKeys || []);
  if (Array.isArray(doc.hooks)) {
    doc.hooks = doc.hooks.filter((h) => {
      const id = typeof h === "string" ? h : h.id || h.name;
      return !prevSet.has(id) || desiredKeys.has(id);
    });
    for (const h of hooksList) {
      const id = typeof h === "string" ? h : h.id || h.name;
      if (!doc.hooks.some((ex) => (typeof ex === "string" ? ex : ex.id || ex.name) === id)) {
        doc.hooks.push(h.def || h);
      }
    }
  } else {
    for (const oldKey of prevSet) {
      if (!desiredKeys.has(oldKey)) {
        delete doc.hooks[oldKey];
      }
    }
    for (const h of hooksList) {
      const id = typeof h === "string" ? h : h.id || h.name;
      doc.hooks[id] = h.def || h;
    }
  }

  fs.writeFileSync(filePath, JSON.stringify(doc, null, 2), "utf8");
  return { ownedKeys: Array.from(desiredKeys) };
}

/**
 * Generates and maintains live cross-agent communication files in D:\Software\AI Agent Space
 * (or effective hubRoot):
 * 1. agent-space-bridge.json: runtime status of all connected agents & projects
 * 2. shared/agent-connectors.json: cross-agent messaging, handoff inboxes, and discovery registry
 * 3. skills.json, plugins.json, mcp_config.json: consolidated catalogs
 */
export function writeHubCommunicationFiles(hubRoot, hubConfig, allPlugins = [], syncSummary = null) {
  if (!hubRoot) return false;
  try {
    ensureDir(hubRoot);
  } catch {
    return false;
  }

  const ides = Array.isArray(hubConfig?.ides) ? hubConfig.ides : [];
  const projects = Array.isArray(hubConfig?.projects) ? hubConfig.projects : [];

  const activeAgents = ides
    .filter((i) => i.enabled !== false)
    .map((ide) => {
      const effectivePaths = resolveEffectiveAgentPaths(ide);
      return {
        id: ide.id,
        name: ide.name,
        agentType: ide.agentType,
        exePath: ide.exePath || null,
        configPath: ide.configPath,
        componentPaths: ide.componentPaths || {},
        effectivePaths,
        status: "connected",
      };
    });

  const activeProjects = projects.map((proj) => {
    const parentIde = ides.find((i) => i.id === proj.ideId) || ides[0] || null;
    const effectivePaths = resolveEffectiveProjectPaths(proj, parentIde);
    return {
      id: proj.id,
      name: proj.name,
      repoPath: proj.repoPath,
      ideId: proj.ideId || null,
      componentPaths: proj.componentPaths || {},
      effectivePaths,
      status: "connected",
    };
  });

  const allSkills = [];
  const seenSkills = new Set();
  const allMcp = {};
  const allRules = [];
  const allAgents = [];
  const allHooks = [];

  for (const p of allPlugins) {
    for (const s of p.skills || []) {
      if (!seenSkills.has(s)) {
        seenSkills.add(s);
        allSkills.push({ name: s, pluginId: p.id, path: path.join(p.path, p.isRootSkills ? "" : "skills", s) });
      }
    }
    const mcpFile = path.join(p.path, "mcp_config.json");
    if (p.hasMcp && fs.existsSync(mcpFile)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(mcpFile, "utf8"));
        const srvs = parsed.mcpServers || parsed.servers || {};
        Object.assign(allMcp, srvs);
      } catch {}
    }
    for (const r of p.rules || []) {
      allRules.push({ name: r, pluginId: p.id });
    }
    for (const a of p.agents || []) {
      allAgents.push({ name: a, pluginId: p.id });
    }
    for (const h of p.hooks || []) {
      allHooks.push({ id: typeof h === "string" ? h : h.id, pluginId: p.id });
    }
  }

  // 1. <hubRoot>/agent-space-bridge.json
  const bridgePayload = {
    version: "1.0.0",
    bridgeProtocol: "magpie-asm-v1",
    updatedAt: new Date().toISOString(),
    hubRoot,
    componentCounts: {
      plugins: allPlugins.length,
      skills: allSkills.length,
      mcpServers: Object.keys(allMcp).length,
      rules: allRules.length,
      agents: allAgents.length,
      hooks: allHooks.length,
    },
    activeAgents,
    activeProjects,
    smartMiddleware: hubConfig?.smartMiddleware || { enabled: true, maxTools: 96 },
    syncSummary: syncSummary || null,
  };
  try {
    fs.writeFileSync(path.join(hubRoot, "agent-space-bridge.json"), JSON.stringify(bridgePayload, null, 2), "utf8");
  } catch {}

  // 2. <hubRoot>/shared/agent-connectors.json
  const sharedDir = path.join(hubRoot, "shared");
  ensureDir(sharedDir);
  const handoffDir = path.join(sharedDir, "handoff");
  ensureDir(handoffDir);

  const connectors = {};
  for (const a of activeAgents) {
    const aHandoff = path.join(handoffDir, a.id);
    ensureDir(aHandoff);
    connectors[a.id] = {
      name: a.name,
      agentType: a.agentType,
      cliCommand: a.exePath || a.agentType,
      configPath: a.configPath,
      skillsDirectory: a.effectivePaths?.skills || a.effectivePaths?.bundle || null,
      mcpConfigFile: a.effectivePaths?.mcp?.file || null,
      rulesFile: a.effectivePaths?.rules?.file || a.effectivePaths?.rulesDir?.dir || null,
      handoffInbox: aHandoff,
      capabilities: a.effectivePaths?.capabilities || {},
    };
  }

  try {
    fs.writeFileSync(
      path.join(sharedDir, "agent-connectors.json"),
      JSON.stringify(
        {
          version: "1.0.0",
          updatedAt: new Date().toISOString(),
          hubRoot,
          handoffRoot: handoffDir,
          connectors,
        },
        null,
        2
      ),
      "utf8"
    );
  } catch {}

  // 3. Consolidated root manifests
  try {
    fs.writeFileSync(path.join(hubRoot, "skills.json"), JSON.stringify({ skills: allSkills }, null, 2), "utf8");
    fs.writeFileSync(
      path.join(hubRoot, "plugins.json"),
      JSON.stringify(
        {
          plugins: allPlugins.map((p) => ({
            id: p.id,
            name: p.name,
            version: p.version,
            description: p.description,
            skillsCount: p.skills?.length || 0,
            hasMcp: p.hasMcp,
            hasHooks: p.hasHooks,
          })),
        },
        null,
        2
      ),
      "utf8"
    );
    if (Object.keys(allMcp).length > 0) {
      fs.writeFileSync(path.join(hubRoot, "mcp_config.json"), JSON.stringify({ mcpServers: allMcp }, null, 2), "utf8");
    }
  } catch {}

  return true;
}
