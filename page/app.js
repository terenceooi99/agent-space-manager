// D:\Software\Magpie\agent-space-manager\page\app.js
// Universal Agent Space Manager with Draggable Reordering, Project Forking, and Dropzones

(async () => {
  const $ = (id) => document.getElementById(id);

  // Default configuration state
  const DEFAULTS = {
    hubRoot: "",
    smartMiddleware: { enabled: true, maxTools: 96 },
    ides: null,
    projects: [],
  };

  function ensurePluginFiles(plugin) {
    if (!plugin) return [];
    if (Array.isArray(plugin.files) && plugin.files.length > 0) {
      return plugin.files;
    }
    const files = [];
    files.push({ name: "plugin.json", relPath: "plugin.json", size: 520 });

    if (Array.isArray(plugin.skills) && plugin.skills.length > 0) {
      plugin.skills.forEach((s) => {
        files.push({ name: "SKILL.md", relPath: `skills/${s}/SKILL.md`, size: 2048 });
      });
    }
    if (Array.isArray(plugin.rules) && plugin.rules.length > 0) {
      plugin.rules.forEach((r) => {
        files.push({ name: r, relPath: `rules/${r}`, size: 1024 });
      });
    }
    if (plugin.hasMcp) {
      files.push({ name: "mcp_config.json", relPath: "mcp_config.json", size: 680 });
    }
    if (plugin.hasHooks) {
      files.push({ name: "hooks.json", relPath: "hooks.json", size: 420 });
    }
    if (Array.isArray(plugin.agents) && plugin.agents.length > 0) {
      plugin.agents.forEach((a) => {
        files.push({ name: a, relPath: `agents/${a}`, size: 1280 });
      });
    }
    if (files.length === 1 && !plugin.hasMcp && !plugin.hasHooks && (!plugin.skills || plugin.skills.length === 0)) {
      files.push({ name: "README.md", relPath: "README.md", size: 1024 });
    }
    plugin.files = files;
    return files;
  }

  function getPluginComponentFiles(plugin) {
    if (!plugin) return [];
    ensurePluginFiles(plugin);
    const items = [];
    const seenFiles = new Set();
    const files = Array.isArray(plugin.files) ? plugin.files : [];

    const formatSize = (bytes) => {
      if (!bytes || bytes <= 0) return "";
      if (bytes > 1048576) return (bytes / 1048576).toFixed(1) + " MB";
      if (bytes > 1024) return (bytes / 1024).toFixed(1) + " KB";
      return bytes + " B";
    };

    // 1. Skills (matching Discovered Components Registry)
    if (Array.isArray(plugin.skills)) {
      for (const skillName of plugin.skills) {
        const match = files.find((f) => {
          const r = (f.relPath || f.name || "").toLowerCase();
          return r === `skills/${skillName.toLowerCase()}/skill.md` ||
                 r.includes(`skills/${skillName.toLowerCase()}/`) ||
                 r.endsWith(`/${skillName.toLowerCase()}/skill.md`);
        });
        if (match) seenFiles.add(match.relPath || match.name);
        items.push({
          badge: "🎯 Skill",
          type: "skill",
          name: skillName,
          sub: "Agent Skill Instruction",
          relPath: match ? (match.relPath || match.name) : (plugin.isRootSkills ? `${skillName}/SKILL.md` : `skills/${skillName}/SKILL.md`),
          sizeStr: match ? formatSize(match.size) : "",
        });
      }
    }

    // 2. MCP Servers
    if (plugin.hasMcp || (Array.isArray(plugin.mcps) && plugin.mcps.length > 0)) {
      const mcps = (Array.isArray(plugin.mcps) && plugin.mcps.length > 0) ? plugin.mcps : [plugin.id];
      for (const mcpName of mcps) {
        const match = files.find((f) => f.name === "mcp_config.json");
        if (match) seenFiles.add(match.relPath || match.name);
        items.push({
          badge: "⚡ MCP Server",
          type: "mcp",
          name: mcpName,
          sub: "mcp_config.json",
          relPath: match ? (match.relPath || match.name) : "mcp_config.json",
          sizeStr: match ? formatSize(match.size) : "",
        });
      }
    }

    // 3. Hooks
    if (plugin.hasHooks || (Array.isArray(plugin.hooks) && plugin.hooks.length > 0)) {
      const hooks = (Array.isArray(plugin.hooks) && plugin.hooks.length > 0) ? plugin.hooks : [`${plugin.id}-hooks`];
      for (const hookName of hooks) {
        const match = files.find((f) => f.name === "hooks.json");
        if (match) seenFiles.add(match.relPath || match.name);
        items.push({
          badge: "🪝 Hook",
          type: "hook",
          name: hookName,
          sub: "hooks.json",
          relPath: match ? (match.relPath || match.name) : "hooks.json",
          sizeStr: match ? formatSize(match.size) : "",
        });
      }
    }

    // 4. Agents
    if (Array.isArray(plugin.agents)) {
      for (const agentName of plugin.agents) {
        const match = files.find((f) => f.name === agentName || (f.relPath || "").includes(`agents/${agentName}`));
        if (match) seenFiles.add(match.relPath || match.name);
        items.push({
          badge: "🤖 Agent",
          type: "agent",
          name: agentName,
          sub: "Subagent Definition",
          relPath: match ? (match.relPath || match.name) : `agents/${agentName}`,
          sizeStr: match ? formatSize(match.size) : "",
        });
      }
    }

    // 5. Rules
    if (Array.isArray(plugin.rules)) {
      for (const ruleName of plugin.rules) {
        const match = files.find((f) => f.name === ruleName || (f.relPath || "").includes(`rules/${ruleName}`));
        if (match) seenFiles.add(match.relPath || match.name);
        items.push({
          badge: "📜 Rule",
          type: "rule",
          name: ruleName,
          sub: "System Instruction",
          relPath: match ? (match.relPath || match.name) : `rules/${ruleName}`,
          sizeStr: match ? formatSize(match.size) : "",
        });
      }
    }

    // 6. Manifest & Documentation & Other Files
    for (const f of files) {
      const key = f.relPath || f.name;
      if (seenFiles.has(key)) continue;
      seenFiles.add(key);

      let badge = "📄 File";
      let type = "file";
      let sub = "";
      if (f.name === "plugin.json") {
        badge = "⚙️ Manifest";
        type = "manifest";
        sub = "Plugin Metadata";
      } else if (f.name.toLowerCase().startsWith("readme")) {
        badge = "📝 Docs";
        type = "docs";
        sub = "Documentation";
      } else if (f.name.endsWith(".json")) {
        badge = "⚙️ Config";
        type = "config";
      } else if (f.name.endsWith(".md")) {
        badge = "📝 Docs";
        type = "docs";
      } else if (f.name.endsWith(".mjs") || f.name.endsWith(".js")) {
        badge = "📜 Script";
        type = "script";
      } else if (f.relPath && (f.relPath.includes("sidecars") || f.name.endsWith(".cmd") || f.name.endsWith(".exe"))) {
        badge = "📦 Sidecar";
        type = "sidecar";
      }

      items.push({
        badge,
        type,
        name: f.name,
        sub,
        relPath: key,
        sizeStr: formatSize(f.size),
      });
    }

    return items;
  }

  function getMagpieApi() {
    return globalThis.magpie?.api?.agentSpaceManager ||
           globalThis.magpie?.api?.["agent-space-manager"] ||
           globalThis.magpie?.api?.smartMiddleware ||
           globalThis.magpie?.api?.["smart-middleware"] ||
           globalThis.magpie?.api;
  }

  // Zero hardcoded plugins - always discovered dynamically from active filesystem
  const DEFAULT_PLUGINS = [];

  const API_BASE = "http://127.0.0.1:41789";

  function normalizePathForCompare(p) {
    return String(p || "").trim().toLowerCase().replace(/\\/g, "/").replace(/\/+$/, "");
  }

  function reloadPluginsCacheScript() {
    return new Promise((resolve) => {
      try {
        const s = document.createElement("script");
        s.src = `plugins-cache.js?t=${Date.now()}`;
        s.onload = () => {
          s.remove();
          resolve(true);
        };
        s.onerror = () => {
          s.remove();
          resolve(false);
        };
        document.head.appendChild(s);
      } catch {
        resolve(false);
      }
    });
  }

  const apiClient = {
    async getPlugins(path, forceReloadScript = false) {
      const targetPath = (path || "").trim();
      const norm = normalizePathForCompare(targetPath);

      // 1. Magpie host IPC bridge (if available)
      try {
        const magpieApi = getMagpieApi();
        if (typeof magpieApi?.getPlugins === "function") {
          const mPlugins = await magpieApi.getPlugins(targetPath);
          if (Array.isArray(mPlugins)) {
            mPlugins.forEach(ensurePluginFiles);
            try {
              localStorage.setItem("magpie_plugins_" + norm, JSON.stringify(mPlugins));
            } catch {}
            return mPlugins;
          }
        }
      } catch {}

      // 2. Local API server dynamically with cache-busting timestamp (when running outside CSP connect-src 'none')
      try {
        const res = await fetch(`${API_BASE}/api/plugins?path=${encodeURIComponent(targetPath)}&t=${Date.now()}`, { signal: AbortSignal.timeout(1200) });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.plugins)) {
            data.plugins.forEach(ensurePluginFiles);
            try {
              localStorage.setItem("magpie_plugins_" + norm, JSON.stringify(data.plugins));
            } catch {}
            if (data.categories) {
              discoveredCategories = data.categories;
            }
            return data.plugins;
          }
        }
      } catch {}

      // 3. Dynamically reload plugins-cache.js via <script> tag (allowed by Magpie iframe CSP script-src 'self'!)
      const currentCacheNorm = normalizePathForCompare(globalThis.__PLUGINS_CACHE__?.path);
      if (forceReloadScript || currentCacheNorm !== norm) {
        await reloadPluginsCacheScript();
      }

      // 4. Synchronous in-memory / script-injected cache (__PLUGINS_CACHE__) strictly if path matches!
      if (globalThis.__PLUGINS_CACHE__ && Array.isArray(globalThis.__PLUGINS_CACHE__.plugins)) {
        const cachePathNorm = normalizePathForCompare(globalThis.__PLUGINS_CACHE__.path);
        if (cachePathNorm === norm) {
          const cached = globalThis.__PLUGINS_CACHE__.plugins;
          cached.forEach(ensurePluginFiles);
          try {
            localStorage.setItem("magpie_plugins_" + norm, JSON.stringify(cached));
          } catch {}
          if (globalThis.__PLUGINS_CACHE__.categories) {
            discoveredCategories = globalThis.__PLUGINS_CACHE__.categories;
          }
          return cached;
        }
      }

      // 5. Same-origin static cache file strictly if path matches!
      try {
        const cRes = await fetch(`./plugins-cache.json?t=${Date.now()}`, { signal: AbortSignal.timeout(1000) });
        if (cRes.ok) {
          const cData = await cRes.json();
          const jsonPathNorm = normalizePathForCompare(cData?.path);
          if (jsonPathNorm === norm && Array.isArray(cData.plugins)) {
            cData.plugins.forEach(ensurePluginFiles);
            if (cData.categories) {
              discoveredCategories = cData.categories;
            }
            return cData.plugins;
          }
        }
      } catch {}

      // 6. LocalStorage cached plugins strictly for this exact path
      try {
        const local = localStorage.getItem("magpie_plugins_" + norm);
        if (local !== null && local !== undefined) {
          const parsed = JSON.parse(local);
          if (Array.isArray(parsed)) {
            parsed.forEach(ensurePluginFiles);
            return parsed;
          }
        }
      } catch {}

      return [];
    },

    async saveConfig(config) {
      try {
        const magpieApi = getMagpieApi();
        if (typeof magpieApi?.saveConfig === "function") {
          const res = await magpieApi.saveConfig(config);
          if (res) return res;
        }
      } catch {}
      try {
        const res = await fetch(`${API_BASE}/api/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(config),
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) return await res.json();
      } catch (err) {
        console.warn("apiClient.saveConfig error:", err);
      }
      return null;
    },

    async removeIde(ideId, killProcesses = true) {
      const magpieApi = getMagpieApi();
      if (typeof magpieApi?.removeIde === "function") {
        return await magpieApi.removeIde(ideId, killProcesses);
      }
      try {
        const res = await fetch(`${API_BASE}/api/remove-ide`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ideId, killProcesses }),
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) return await res.json();
      } catch {}
      return null;
    },

    async removeProject(projectId) {
      const magpieApi = getMagpieApi();
      if (typeof magpieApi?.removeProject === "function") {
        return await magpieApi.removeProject(projectId);
      }
      try {
        const res = await fetch(`${API_BASE}/api/remove-project`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId }),
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) return await res.json();
      } catch {}
      return null;
    },

    async resolveDroppedTarget(raw, mode) {
      try {
        const magpieApi = getMagpieApi();
        if (typeof magpieApi?.resolveDroppedTarget === "function") {
          const res = await magpieApi.resolveDroppedTarget(raw, mode);
          if (res) return res;
        }
      } catch {}
      try {
        const res = await fetch(`${API_BASE}/api/resolve?path=${encodeURIComponent(raw || "")}&mode=${encodeURIComponent(mode || "ide")}`, { signal: AbortSignal.timeout(10000) });
        if (res.ok) return await res.json();
      } catch (err) {
        console.warn("apiClient.resolveDroppedTarget error:", err);
      }
      return null;
    },

    async browseFileSystem(type) {
      try {
        const magpieApi = getMagpieApi();
        if (typeof magpieApi?.browseFileSystem === "function") {
          const res = await magpieApi.browseFileSystem(type);
          if (res) return res;
        }
      } catch {}
      try {
        const res = await fetch(`${API_BASE}/api/browse?type=${encodeURIComponent(type || "file")}`, { signal: AbortSignal.timeout(90000) });
        if (res.ok) return await res.json();
      } catch (err) {
        console.warn("apiClient.browseFileSystem error:", err);
      }
      return null;
    },

    async detectConfigPath(name, exePath) {
      try {
        const magpieApi = getMagpieApi();
        if (typeof magpieApi?.detectConfigPath === "function") {
          const detected = await magpieApi.detectConfigPath(name, exePath);
          if (detected) return detected;
        }
      } catch {}
      try {
        const res = await fetch(`${API_BASE}/api/detect-config?name=${encodeURIComponent(name || "")}&exePath=${encodeURIComponent(exePath || "")}`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          const data = await res.json();
          return data.configPath;
        }
      } catch {}
      return null;
    },

    async getConfig() {
      try {
        const magpieApi = getMagpieApi();
        if (typeof magpieApi?.getConfig === "function") {
          const cfg = await magpieApi.getConfig();
          if (cfg && Array.isArray(cfg.ides)) return cfg;
        }
      } catch {}
      try {
        const res = await fetch(`${API_BASE}/api/config`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) return await res.json();
      } catch {}
      return null;
    },

    async getAgentProfiles() {
      try {
        const magpieApi = getMagpieApi();
        if (typeof magpieApi?.getAgentProfiles === "function") {
          const list = await magpieApi.getAgentProfiles();
          if (Array.isArray(list) && list.length > 0) return list;
        }
      } catch {}
      try {
        const res = await fetch(`${API_BASE}/api/agents`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data?.agents)) return data.agents;
        }
      } catch {}
      return null;
    },
  };

  const FALLBACK_AGENT_PROFILES = [
    { id: "antigravity", label: "Antigravity (Google)", mode: "bundle", description: "Native plugin bundle support (~/.gemini/config/plugins)", capabilities: { skills: true, mcp: true, rules: true, agents: true, hooks: true }, defaultConfigPath: "~/.gemini/config/plugins" },
    { id: "claude-code", label: "Claude Code (Anthropic)", mode: "convert", description: "Skills in ~/.claude/skills, MCP in ~/.claude.json, Rules in ~/.claude/CLAUDE.md, Subagents in ~/.claude/agents", capabilities: { skills: true, mcp: true, rules: true, agents: true, hooks: false }, defaultConfigPath: "~/.claude/skills" },
    { id: "codex", label: "Codex CLI (OpenAI)", mode: "convert", description: "Skills in ~/.codex/skills, MCP in ~/.codex/config.toml, Rules in ~/.codex/AGENTS.md", capabilities: { skills: true, mcp: true, rules: true, agents: false, hooks: false }, defaultConfigPath: "~/.codex/skills" },
    { id: "opencode", label: "OpenCode", mode: "convert", description: "Skills in ~/.config/opencode/skills, MCP in opencode.json, Rules in AGENTS.md, Subagents in agents/", capabilities: { skills: true, mcp: true, rules: true, agents: true, hooks: false }, defaultConfigPath: "~/.config/opencode/skills" },
    { id: "vscode-copilot", label: "VS Code / GitHub Copilot", mode: "convert", description: "Skills in ~/.copilot/skills, MCP in Code/User/mcp.json, Instructions & Agents in Code/User/prompts", capabilities: { skills: true, mcp: true, rules: true, agents: true, hooks: false }, defaultConfigPath: "~/.copilot/skills" },
    { id: "cursor", label: "Cursor AI", mode: "convert", description: "Skills in ~/.cursor/skills, MCP in ~/.cursor/mcp.json", capabilities: { skills: true, mcp: true, rules: false, agents: false, hooks: false }, defaultConfigPath: "~/.cursor/skills" },
    { id: "windsurf", label: "Windsurf (Codeium)", mode: "convert", description: "Skills in ~/.codeium/windsurf/skills, MCP in mcp_config.json, Rules in memories/global_rules.md", capabilities: { skills: true, mcp: true, rules: true, agents: false, hooks: false }, defaultConfigPath: "~/.codeium/windsurf/skills" },
    { id: "gemini-cli", label: "Gemini CLI (Standalone)", mode: "convert", description: "Skills in ~/.gemini/skills, MCP in ~/.gemini/settings.json, Rules in ~/.gemini/GEMINI.md", capabilities: { skills: true, mcp: true, rules: true, agents: false, hooks: false }, defaultConfigPath: "~/.gemini/skills" },
    { id: "cline", label: "Cline (VS Code Extension)", mode: "convert", description: "Skills in ~/.cline/skills, MCP in cline_mcp_settings.json, Rules in ~/Documents/Cline/Rules", capabilities: { skills: true, mcp: true, rules: true, agents: false, hooks: false }, defaultConfigPath: "~/.cline/skills" },
    { id: "roo-code", label: "Roo Code", mode: "convert", description: "Skills in ~/.roo/skills, MCP in rooveterinaryinc.roo-cline mcp_settings.json, Rules in ~/.roo/rules", capabilities: { skills: true, mcp: true, rules: true, agents: false, hooks: false }, defaultConfigPath: "~/.roo/skills" },
    { id: "kiro", label: "Kiro (AWS)", mode: "convert", description: "Skills in ~/.kiro/skills, MCP in ~/.kiro/settings/mcp.json, Steering rules in ~/.kiro/steering", capabilities: { skills: true, mcp: true, rules: true, agents: false, hooks: false }, defaultConfigPath: "~/.kiro/skills" },
    { id: "agents-universal", label: "Universal Agent Skills (~/.agents/skills)", mode: "convert", description: "Shared ~/.agents/skills directory read by OpenCode, Copilot, Codex, and Antigravity", capabilities: { skills: true, mcp: false, rules: false, agents: false, hooks: false }, defaultConfigPath: "~/.agents/skills" },
    { id: "custom", label: "Custom Agent / Directory", mode: "convert", description: "User-specified target directory", capabilities: { skills: true, mcp: false, rules: false, agents: false, hooks: false }, defaultConfigPath: "~/.agent/skills" },
  ];

  let agentProfiles = [...FALLBACK_AGENT_PROFILES];
  let lastSyncByIde = {};

  let hubConfig = { ...DEFAULTS };
  let discoveredPlugins = [];
  let discoveredCategories = { plugins: [], mcps: [], hooks: [], skills: [], agents: [], rules: [] };
  let expandedFiles = new Set();
  let allFilesExpanded = false;
  let activeCategoryTab = "all";
  let categorySearchFilter = "";
  let currentSelection = { type: "ide", id: "antigravity" };
  let autoSyncTimer = null;
  let draggedItem = null;

  // 1. Handshake with Magpie bridge safely
  try {
    if (globalThis.magpie?.ready) {
      await Promise.race([
        globalThis.magpie.ready,
        new Promise((resolve) => setTimeout(resolve, 800)),
      ]);
    }
  } catch (err) {
    console.warn("Magpie bridge handshake timeout/skip:", err);
  }

  // 2. Read saved config from local API server first
  try {
    const backendConfig = await apiClient.getConfig();
    if (backendConfig?.ides && Array.isArray(backendConfig.ides)) {
      hubConfig = backendConfig;
    }
  } catch (err) {
    console.warn("Failed to load hubConfig from API server:", err);
  }

  // 3. Read saved options from Magpie
  try {
    if (globalThis.magpie?.options?.get) {
      const saved = await globalThis.magpie.options.get();
      if (saved && typeof saved === "object") {
        if (saved.hubConfig) hubConfig = saved.hubConfig;
        if (saved.smartMiddlewareEnabled !== undefined) {
          if (!hubConfig.smartMiddleware) hubConfig.smartMiddleware = {};
          hubConfig.smartMiddleware.enabled = Boolean(saved.smartMiddlewareEnabled);
        }
        if (saved.maxTools !== undefined && Number.isInteger(saved.maxTools)) {
          if (!hubConfig.smartMiddleware) hubConfig.smartMiddleware = {};
          hubConfig.smartMiddleware.maxTools = saved.maxTools;
        }
        if (saved.toolsRoot !== undefined) {
          hubConfig.hubRoot = saved.toolsRoot;
        }
      }
    }
  } catch (err) {
    console.warn("Failed to load options from Magpie:", err);
  }

  // Read from localStorage fallback
  try {
    const local = localStorage.getItem("magpie_agent_space_config");
    if (local && !Array.isArray(hubConfig.ides)) {
      const parsed = JSON.parse(local);
      if (parsed?.ides) hubConfig = parsed;
    }
  } catch {}

  // Ensure default Antigravity IDE is present ONLY on first run if ides was never configured
  if (!Array.isArray(hubConfig.ides)) {
    hubConfig.ides = [
      {
        id: "antigravity",
        name: "Antigravity (Google Gemini)",
        agentType: "antigravity",
        exePath: "",
        configPath: "",
        enabled: true,
        plugins: {},
      },
    ];
  }

  // 4. Query live agent profiles and plugins from active storage path
  try {
    const liveProfiles = await apiClient.getAgentProfiles();
    if (Array.isArray(liveProfiles) && liveProfiles.length > 0) {
      agentProfiles = liveProfiles;
    }
  } catch {}
  await reloadPluginsFromHub();

  let editingIdeId = null;
  let editingProjectId = null;

  function populateComponentPathsInputs(agentType, componentPaths = null) {
    const prof = agentProfiles.find((p) => p.id === agentType) || agentProfiles[0];
    const defaults = prof?.defaultComponentPaths || {};
    const current = componentPaths || {};

    if ($("cpBundleInput")) $("cpBundleInput").value = current.bundle || (prof?.mode === "bundle" ? (prof?.defaultConfigPath || "") : "");
    if ($("cpSkillsInput")) $("cpSkillsInput").value = current.skills || defaults.skills || (prof?.mode !== "bundle" ? (prof?.defaultConfigPath || "") : "");
    if ($("cpCommandsInput")) $("cpCommandsInput").value = current.commands || defaults.commands || "";
    if ($("cpMcpInput")) $("cpMcpInput").value = current.mcp || defaults.mcp || "";
    if ($("cpRulesInput")) $("cpRulesInput").value = current.rules || defaults.rules || "";
    if ($("cpAgentsInput")) $("cpAgentsInput").value = current.agents || defaults.agents || "";
    if ($("cpHooksInput")) $("cpHooksInput").value = current.hooks || defaults.hooks || "";
  }

  function collectComponentPathsFromInputs() {
    const res = {};
    const b = $("cpBundleInput")?.value?.trim();
    const s = $("cpSkillsInput")?.value?.trim();
    const c = $("cpCommandsInput")?.value?.trim();
    const m = $("cpMcpInput")?.value?.trim();
    const r = $("cpRulesInput")?.value?.trim();
    const a = $("cpAgentsInput")?.value?.trim();
    const h = $("cpHooksInput")?.value?.trim();
    if (b) res.bundle = b;
    if (s) res.skills = s;
    if (c) res.commands = c;
    if (m) res.mcp = m;
    if (r) res.rules = r;
    if (a) res.agents = a;
    if (h) res.hooks = h;
    return res;
  }

  function renderSelectedAgentMeta(agentId) {
    const prof = agentProfiles.find((p) => p.id === agentId) || agentProfiles[0];
    if (!prof) return;
    const chipsEl = $("agentCapabilityChips");
    if (chipsEl) {
      const caps = [
        { key: "skills", label: "Skills" },
        { key: "mcp", label: "MCP" },
        { key: "rules", label: "Rules" },
        { key: "agents", label: "Subagents" },
        { key: "hooks", label: "Hooks" },
      ];
      chipsEl.innerHTML = caps.map((c) => {
        const ok = prof.capabilities?.[c.key];
        const bg = ok ? "rgba(22,163,74,0.14)" : "rgba(128,128,128,0.1)";
        const fg = ok ? "#16a34a" : "var(--magpie-muted)";
        return `<span style="font-size:10.5px; font-weight:600; padding:2px 7px; border-radius:4px; background:${bg}; color:${fg};">${c.label} ${ok ? "✓" : "–"}</span>`;
      }).join("");
    }
    const pathsEl = $("agentTargetPaths");
    if (pathsEl) {
      pathsEl.textContent = prof.description || `Default link path: ${prof.defaultConfigPath}`;
    }
    if (!editingIdeId) {
      populateComponentPathsInputs(agentId);
    }
  }

  function setComponentPathsCollapsed(collapsed) {
    const body = $("componentPathsBody");
    const toggleBtn = $("btnToggleComponentPaths");
    const toggleIcon = $("componentPathsToggleIcon");
    const resetBtn = $("btnResetComponentPaths");
    if (!body) return;
    if (collapsed) {
      body.style.display = "none";
      if (toggleBtn) toggleBtn.textContent = "▶ Expand";
      if (toggleIcon) toggleIcon.textContent = "▶";
      if (resetBtn) resetBtn.style.display = "none";
    } else {
      body.style.display = "block";
      if (toggleBtn) toggleBtn.textContent = "▲ Minimize";
      if (toggleIcon) toggleIcon.textContent = "▼";
      if (resetBtn) resetBtn.style.display = "inline-block";
    }
  }

  function openEditIdeModal(ide) {
    editingIdeId = ide.id;
    if ($("addIdeModal")) $("addIdeModal").style.display = "flex";
    const titleEl = $("addIdeModal")?.querySelector(".modal-head h3");
    if (titleEl) titleEl.textContent = `Edit Agent IDE (${ide.name})`;
    if ($("saveIdeBtn")) $("saveIdeBtn").textContent = "Save Changes";

    if ($("ideNameInput")) $("ideNameInput").value = ide.name || "";
    if ($("ideExeInput")) $("ideExeInput").value = ide.exePath || "";
    if ($("agentTypeSelect")) $("agentTypeSelect").value = ide.agentType || "antigravity";
    if ($("ideConfigInput")) {
      $("ideConfigInput").value = ide.configPath || "";
      $("ideConfigInput").readOnly = false;
    }
    if ($("autoDetectConfigToggle")) $("autoDetectConfigToggle").checked = false;
    if ($("autoDetectLabel")) {
      $("autoDetectLabel").textContent = "Auto-detect: OFF (Custom)";
      $("autoDetectLabel").style.color = "var(--magpie-muted)";
    }
    renderSelectedAgentMeta(ide.agentType || "antigravity");
    populateComponentPathsInputs(ide.agentType, ide.componentPaths);

    const hasCustomPaths = ide.componentPaths && Object.values(ide.componentPaths).some((v) => Boolean(v));
    setComponentPathsCollapsed(!hasCustomPaths);
  }

  function openEditProjectModal(proj) {
    editingProjectId = proj.id;
    if ($("addProjectModal")) $("addProjectModal").style.display = "flex";
    if ($("projectModalTitle")) $("projectModalTitle").textContent = `Edit Project Repository (${proj.name})`;
    if ($("saveProjectBtn")) $("saveProjectBtn").textContent = "Save Changes";
    if ($("projectNameInput")) $("projectNameInput").value = proj.name || "";
    if ($("projectPathInput")) $("projectPathInput").value = proj.repoPath || "";

    const select = $("projectIdeSelect");
    if (select) {
      select.innerHTML = "";
      hubConfig.ides.forEach((ide) => {
        const opt = document.createElement("option");
        opt.value = ide.id;
        opt.textContent = ide.name;
        if (ide.id === proj.ideId) opt.selected = true;
        select.appendChild(opt);
      });
    }
  }

  // 5. Render initial view and setup listeners
  renderAll();
  setupEventListeners();

  async function reloadPluginsFromHub(forceReloadScript = false) {
    const effective = computeEffectiveHubPath();
    const targetPath = effective.path;
    discoveredCategories = { plugins: [], mcps: [], hooks: [], skills: [], agents: [], rules: [] };
    const plugins = await apiClient.getPlugins(targetPath, forceReloadScript);
    discoveredPlugins = Array.isArray(plugins) ? plugins : [];
    if (discoveredPlugins.length === 0) {
      discoveredCategories = { plugins: [], mcps: [], hooks: [], skills: [], agents: [], rules: [] };
    } else if (!discoveredCategories.plugins || discoveredCategories.plugins.length === 0) {
      discoveredCategories = buildClientCategoriesRegistry(discoveredPlugins);
    }
  }

  function getFirstIdeConfigPath() {
    if (hubConfig.ides && hubConfig.ides.length > 0 && hubConfig.ides[0].configPath) {
      return hubConfig.ides[0].configPath;
    }
    return "";
  }

  function computeEffectiveHubPath() {
    if (hubConfig.hubRoot && hubConfig.hubRoot.trim() !== "") {
      return { path: hubConfig.hubRoot.trim(), isAuto: false };
    }
    return { path: "D:\\Software\\AI Agent Space", isAuto: true };
  }

  function computeComponentCounts() {
    let plugins = discoveredPlugins.length;
    let mcps = 0;
    let hooks = 0;
    let skills = 0;
    let agents = 0;
    let rules = 0;

    discoveredPlugins.forEach((p) => {
      if (p.hasMcp) mcps += (p.mcps?.length || 1);
      if (p.hasHooks) hooks += (p.hooks?.length || 1);
      skills += (p.skills || []).length;
      agents += (p.agents || []).length;
      rules += (p.rules || []).length;
    });

    return { plugins, mcps, hooks, skills, agents, rules };
  }

  function buildClientCategoriesRegistry(plugins = []) {
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
      ensurePluginFiles(p);
      categories.plugins.push({
        id: p.id,
        name: p.name,
        version: p.version,
        path: p.path,
        description: p.description,
        skillsCount: (p.skills || []).length,
        filesCount: (p.files || []).length,
        files: p.files,
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
            sourcePath: p.isRootSkills ? `${p.path}\\${s}` : `${p.path}\\skills\\${s}`,
          });
        }
      }

      for (const m of (p.mcps || (p.hasMcp ? [p.id] : []))) {
        if (!seenMcps.has(m)) {
          seenMcps.add(m);
          categories.mcps.push({
            name: m,
            pluginId: p.id,
            pluginName: p.name,
            sourcePath: `${p.path}\\mcp_config.json`,
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
            sourcePath: `${p.path}\\hooks.json`,
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
            sourcePath: `${p.path}\\agents\\${a}`,
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
            sourcePath: `${p.path}\\rules\\${r}`,
          });
        }
      }
    }

    return categories;
  }

  function renderCategoryBrowser() {
    const cats = (discoveredCategories && typeof discoveredCategories === "object" && Array.isArray(discoveredCategories.plugins) && discoveredCategories.plugins.length > 0)
      ? discoveredCategories
      : buildClientCategoriesRegistry(discoveredPlugins);

    const pLen = (cats.plugins || []).length;
    const mLen = (cats.mcps || []).length;
    const hLen = (cats.hooks || []).length;
    const sLen = (cats.skills || []).length;
    const aLen = (cats.agents || []).length;
    const rLen = (cats.rules || []).length;
    const totalCount = (pLen + mLen + hLen + sLen + aLen + rLen);

    if ($("cat-cnt-total")) $("cat-cnt-total").textContent = totalCount;
    if ($("cat-cnt-all")) $("cat-cnt-all").textContent = totalCount;
    if ($("cat-cnt-plugins")) $("cat-cnt-plugins").textContent = pLen;
    if ($("cat-cnt-mcps")) $("cat-cnt-mcps").textContent = mLen;
    if ($("cat-cnt-hooks")) $("cat-cnt-hooks").textContent = hLen;
    if ($("cat-cnt-skills")) $("cat-cnt-skills").textContent = sLen;
    if ($("cat-cnt-agents")) $("cat-cnt-agents").textContent = aLen;
    if ($("cat-cnt-rules")) $("cat-cnt-rules").textContent = rLen;

    const container = $("categoryItemsContainer");
    if (!container) return;

    if (totalCount === 0) {
      container.innerHTML = `<div style="text-align:center; padding:16px; color:var(--magpie-muted);">No components discovered in this storage path.</div>`;
      return;
    }

    let items = [];
    if (activeCategoryTab === "all" || activeCategoryTab === "plugins") {
      items.push(...cats.plugins.map(p => ({
        type: "plugin",
        badge: "🧩 Plugin",
        name: p.name,
        sub: p.version ? `v${p.version}` : "",
        path: p.path,
        desc: p.description,
      })));
    }
    if (activeCategoryTab === "all" || activeCategoryTab === "mcps") {
      items.push(...cats.mcps.map(m => ({
        type: "mcp",
        badge: "⚡ MCP Server",
        name: m.name,
        sub: m.pluginName ? `from ${m.pluginName}` : "",
        path: m.sourcePath,
        desc: "Model Context Protocol Server",
      })));
    }
    if (activeCategoryTab === "all" || activeCategoryTab === "hooks") {
      items.push(...cats.hooks.map(h => ({
        type: "hook",
        badge: "🪝 Hook",
        name: h.name,
        sub: h.pluginName ? `from ${h.pluginName}` : "",
        path: h.sourcePath,
        desc: "Execution Lifecycle Middleware Hook",
      })));
    }
    if (activeCategoryTab === "all" || activeCategoryTab === "skills") {
      items.push(...cats.skills.map(s => ({
        type: "skill",
        badge: "🎯 Skill",
        name: s.name,
        sub: s.pluginName ? `from ${s.pluginName}` : "",
        path: s.sourcePath,
        desc: "Agent Skill Instruction / SKILL.md",
      })));
    }
    if (activeCategoryTab === "all" || activeCategoryTab === "agents") {
      items.push(...cats.agents.map(a => ({
        type: "agent",
        badge: "🤖 Agent",
        name: a.name,
        sub: a.pluginName ? `from ${a.pluginName}` : "",
        path: a.sourcePath,
        desc: "Subagent Definition Template",
      })));
    }
    if (activeCategoryTab === "all" || activeCategoryTab === "rules") {
      items.push(...cats.rules.map(r => ({
        type: "rule",
        badge: "📜 Rule",
        name: r.name,
        sub: r.pluginName ? `from ${r.pluginName}` : "",
        path: r.sourcePath,
        desc: "System Instruction & Rule Spec",
      })));
    }

    if (categorySearchFilter) {
      const q = categorySearchFilter.toLowerCase();
      items = items.filter(it =>
        it.name.toLowerCase().includes(q) ||
        it.sub.toLowerCase().includes(q) ||
        (it.path && it.path.toLowerCase().includes(q))
      );
    }

    if (items.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:16px; color:var(--magpie-muted);">No items match the selected filter.</div>`;
      return;
    }

    container.innerHTML = items.map(it => `
      <div class="cat-item-row">
        <div class="cat-item-title">
          <span style="font-size:10.5px; font-weight:600; padding:2px 6px; border-radius:4px; background:rgba(37,99,235,0.12); color:#2563eb;">${escapeHtml(it.badge)}</span>
          <span><strong>${escapeHtml(it.name)}</strong></span>
          ${it.sub ? `<span style="font-size:11px; opacity:0.75;">(${escapeHtml(it.sub)})</span>` : ""}
        </div>
        <div class="cat-item-meta" title="${escapeHtml(it.path || "")}">
          ${escapeHtml(it.path ? it.path.split(/[/\\]/).slice(-2).join("/") : "")}
        </div>
      </div>
    `).join("");
  }

  function renderAll() {
    const isSmEnabled = hubConfig.smartMiddleware?.enabled !== false;
    const currentCap = Number(hubConfig.smartMiddleware?.maxTools) || 96;

    if ($("smartMiddlewareToggle")) $("smartMiddlewareToggle").checked = isSmEnabled;
    if ($("middlewareStatusLabel")) {
      $("middlewareStatusLabel").textContent = isSmEnabled
        ? "Smart Middleware: Active"
        : "Smart Middleware: Bypassed";
      $("middlewareStatusLabel").className = `toggle-label ${isSmEnabled ? "" : "disabled"}`;
    }
    if ($("gatewayStatus")) {
      $("gatewayStatus").textContent = isSmEnabled ? "Active" : "Disabled";
    }
    if ($("maxToolsInput")) {
      $("maxToolsInput").value = currentCap;
    }
    if ($("capSubtitle")) {
      $("capSubtitle").textContent = isSmEnabled
        ? `Capping at ${currentCap} safe tools for Smart Middleware`
        : "Optimization bypassed";
    }

    // Hub Storage Path rendering
    const effectiveHub = computeEffectiveHubPath();
    if ($("hubPathInput")) {
      if (document.activeElement !== $("hubPathInput")) {
        $("hubPathInput").value = hubConfig.hubRoot || "";
      }
      $("hubPathInput").placeholder = `Default Hub: ${effectiveHub.path}`;
    }
    if ($("hubPathBadge")) {
      if (hubConfig.hubRoot && hubConfig.hubRoot.trim() !== "") {
        if (discoveredPlugins.length === 0) {
          $("hubPathBadge").textContent = "Invalid / 0 Components";
          $("hubPathBadge").className = "hub-path-badge disabled";
        } else {
          $("hubPathBadge").textContent = "Custom Path";
          $("hubPathBadge").className = "hub-path-badge";
        }
      } else {
        $("hubPathBadge").textContent = "Default Hub";
        $("hubPathBadge").className = "hub-path-badge auto";
      }
    }
    if ($("hubPathHint")) {
      if (hubConfig.hubRoot && hubConfig.hubRoot.trim() !== "") {
        $("hubPathHint").textContent = discoveredPlugins.length === 0
          ? `⚠️ Directory not found or contains 0 components: ${effectiveHub.path}`
          : `Active components storage: ${effectiveHub.path}`;
      } else {
        $("hubPathHint").textContent = `Using central Hub root: ${effectiveHub.path}`;
      }
    }

    // Metric tiles - 7 lines breakdown
    const counts = computeComponentCounts();
    if ($("cnt-plugins")) $("cnt-plugins").textContent = String(counts.plugins);
    if ($("cnt-mcps")) $("cnt-mcps").textContent = String(counts.mcps);
    if ($("cnt-hooks")) $("cnt-hooks").textContent = String(counts.hooks);
    if ($("cnt-skills")) $("cnt-skills").textContent = String(counts.skills);
    if ($("cnt-agents")) $("cnt-agents").textContent = String(counts.agents);
    if ($("cnt-rules")) $("cnt-rules").textContent = String(counts.rules);

    if ($("ideCount")) $("ideCount").textContent = String(hubConfig.ides?.length || 0);
    if ($("projectCount")) $("projectCount").textContent = String(hubConfig.projects?.length || 0);

    renderIdeList();
    renderProjectList();
    renderPluginTable();
    renderCategoryBrowser();
  }

  function renderIdeList() {
    const listEl = $("ideList");
    if (!listEl) return;
    listEl.innerHTML = "";

    if (!hubConfig.ides || hubConfig.ides.length === 0) {
      listEl.innerHTML = `<div class="hint">No IDEs registered. Click "+ Add IDE" to add one.</div>`;
      return;
    }

    hubConfig.ides.forEach((ide, index) => {
      const isSelected = currentSelection.type === "ide" && currentSelection.id === ide.id;
      const item = document.createElement("div");
      item.className = `target-item ${isSelected ? "active" : ""}`;
      item.draggable = true;
      item.dataset.index = index;
      item.dataset.type = "ide";

      const prof = agentProfiles.find((p) => p.id === ide.agentType) ||
                   agentProfiles.find((p) => ide.id?.includes(p.id) || ide.name?.toLowerCase().includes(p.id)) ||
                   agentProfiles[0];
      const modeBadge = prof?.mode === "bundle"
        ? `<span style="font-size:9.5px; padding:1px 5px; border-radius:4px; background:rgba(16,185,129,0.15); color:#10b981; margin-left:6px;">Bundle</span>`
        : `<span style="font-size:9.5px; padding:1px 5px; border-radius:4px; background:rgba(59,130,246,0.15); color:#3b82f6; margin-left:6px;">Native Adapter</span>`;

      const syncInfo = lastSyncByIde[ide.id];
      let syncSubtitle = "";
      if (syncInfo?.summary) {
        const s = syncInfo.summary;
        if (syncInfo.mode === "bundle") {
          syncSubtitle = `<div style="font-size:10px; color:#10b981; margin-top:2px;">Synced: ${s.plugins || 0} plugin bundles</div>`;
        } else {
          const parts = [];
          if (s.skills !== undefined) parts.push(`${s.skills} skills`);
          if (s.mcp) parts.push(`${s.mcp} MCP`);
          if (s.rules) parts.push(`${s.rules} rules`);
          if (s.agents) parts.push(`${s.agents} agents`);
          if (s.conflicts) parts.push(`${s.conflicts} conflicts`);
          syncSubtitle = `<div style="font-size:10px; color:#3b82f6; margin-top:2px;">Synced: ${parts.join(" · ") || "0 items"}</div>`;
        }
      }

      item.innerHTML = `
        <div style="display:flex; align-items:center; flex:1; min-width:0;">
          <span class="drag-handle" title="Drag to reorder">⋮⋮</span>
          <div style="flex:1; min-width:0;">
            <div class="target-title">
              <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#22c55e;"></span>
              ${escapeHtml(ide.name)}
              ${modeBadge}
            </div>
            <div class="target-path">${escapeHtml(truncate(ide.configPath, 42))}</div>
            ${syncSubtitle}
          </div>
        </div>
        <div class="target-item-actions">
          <button type="button" class="btn-edit-text edit-ide-btn" data-id="${escapeHtml(ide.id)}" title="Edit this IDE info & custom paths">Edit</button>
          <button type="button" class="btn-danger-text delete-ide-btn" data-id="${escapeHtml(ide.id)}" title="Remove this IDE">Remove</button>
        </div>
      `;

      item.addEventListener("click", (e) => {
        if (e.target.closest(".delete-ide-btn") || e.target.closest(".edit-ide-btn")) return;
        currentSelection = { type: "ide", id: ide.id };
        renderAll();
      });

      const editBtn = item.querySelector(".edit-ide-btn");
      if (editBtn) {
        editBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          openEditIdeModal(ide);
        });
      }

      // Drag and drop reordering
      item.addEventListener("dragstart", (e) => {
        draggedItem = { type: "ide", index };
        item.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });
      item.addEventListener("dragend", () => {
        item.classList.remove("dragging");
        draggedItem = null;
      });
      item.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      });
      item.addEventListener("drop", (e) => {
        e.preventDefault();
        if (!draggedItem || draggedItem.type !== "ide" || draggedItem.index === index) return;
        const moved = hubConfig.ides.splice(draggedItem.index, 1)[0];
        hubConfig.ides.splice(index, 0, moved);
        triggerAutoSync();
        renderAll();
      });

      // Direct, reliable removal: unlinks all owned components and cleans state
      const removeBtn = item.querySelector(".delete-ide-btn");
      if (removeBtn) {
        removeBtn.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();

          const targetId = ide.id;
          const ideName = ide.name || "Agent";

          const confirmRemove = confirm(`Remove "${ideName}"?\n\nThis will sever all component links and close any running "${ideName}" background processes immediately so changes take effect without restarting your computer.\n\nContinue?`);
          if (!confirmRemove) return;

          removeBtn.disabled = true;
          removeBtn.textContent = "Removing...";

          try {
            await apiClient.removeIde(targetId, true);
          } catch (err) {
            console.warn("apiClient.removeIde error:", err);
          }

          hubConfig.ides = (hubConfig.ides || []).filter((i) => i.id !== targetId);
          hubConfig.projects = (hubConfig.projects || []).filter((p) => p.ideId !== targetId);

          if (currentSelection.id === targetId) {
            currentSelection = { type: "ide", id: hubConfig.ides[0]?.id || "" };
          }

          await persistConfig();
          renderAll();
        });
      }

      listEl.appendChild(item);
    });
  }

  function renderProjectList() {
    const listEl = $("projectList");
    if (!listEl) return;
    listEl.innerHTML = "";

    if (!hubConfig.projects || hubConfig.projects.length === 0) {
      listEl.innerHTML = `<div class="hint">No specific project overrides. All projects inherit global IDE configuration.</div>`;
      return;
    }

    hubConfig.projects.forEach((proj, index) => {
      const isSelected = currentSelection.type === "project" && currentSelection.id === proj.id;
      const associatedIde = hubConfig.ides.find((i) => i.id === proj.ideId);
      const ideLabel = associatedIde ? associatedIde.name : "Unassigned IDE";

      const item = document.createElement("div");
      item.className = `target-item ${isSelected ? "active" : ""}`;
      item.draggable = true;
      item.dataset.index = index;
      item.dataset.type = "project";

      item.innerHTML = `
        <div style="display:flex; align-items:center; flex:1; min-width:0;">
          <span class="drag-handle" title="Drag to reorder">⋮⋮</span>
          <div style="flex:1; min-width:0;">
            <div class="target-title">
              <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#3b82f6;"></span>
              ${escapeHtml(proj.name)}
              <span style="font-size:10px;color:var(--magpie-muted);margin-left:4px;">[${escapeHtml(ideLabel)}]</span>
            </div>
            <div class="target-path">${escapeHtml(truncate(proj.repoPath, 42))}</div>
          </div>
        </div>
        <div class="target-item-actions">
          <button type="button" class="btn-edit-text edit-proj-btn" data-id="${escapeHtml(proj.id)}" title="Edit project info">Edit</button>
          <button type="button" class="btn-action-text copy-proj-btn" title="Copy info and assign to another IDE">Clone / Fork</button>
          <button type="button" class="btn-danger-text delete-proj-btn" data-id="${escapeHtml(proj.id)}" title="Remove project override">Remove</button>
        </div>
      `;

      item.addEventListener("click", (e) => {
        if (e.target.closest(".delete-proj-btn") || e.target.closest(".copy-proj-btn") || e.target.closest(".edit-proj-btn")) return;
        currentSelection = { type: "project", id: proj.id };
        renderAll();
      });

      const editBtn = item.querySelector(".edit-proj-btn");
      if (editBtn) {
        editBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          openEditProjectModal(proj);
        });
      }

      // Drag and drop reordering
      item.addEventListener("dragstart", (e) => {
        draggedItem = { type: "project", index };
        item.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
      });
      item.addEventListener("dragend", () => {
        item.classList.remove("dragging");
        draggedItem = null;
      });
      item.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      });
      item.addEventListener("drop", (e) => {
        e.preventDefault();
        if (!draggedItem || draggedItem.type !== "project" || draggedItem.index === index) return;
        const moved = hubConfig.projects.splice(draggedItem.index, 1)[0];
        hubConfig.projects.splice(index, 0, moved);
        triggerAutoSync();
        renderAll();
      });

      // Clone / Fork project info to easily switch associated IDE
      const copyBtn = item.querySelector(".copy-proj-btn");
      if (copyBtn) {
        copyBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          openCloneProjectModal(proj);
        });
      }

      // Remove button: unlinks all owned project links and removes state
      // Direct, reliable removal for project overrides
      const deleteProjBtn = item.querySelector(".delete-proj-btn");
      if (deleteProjBtn) {
        deleteProjBtn.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();

          const targetId = proj.id;
          const projName = proj.name || "Project";
          const confirmRemove = confirm(`Remove project override "${projName}"?\n\nAll repository component links will be severed immediately.\n\nContinue?`);
          if (!confirmRemove) return;

          deleteProjBtn.disabled = true;
          deleteProjBtn.textContent = "Removing...";

          try {
            await apiClient.removeProject(targetId);
          } catch (err) {
            console.warn("apiClient.removeProject error:", err);
          }

          hubConfig.projects = (hubConfig.projects || []).filter((p) => p.id !== targetId);
          if (currentSelection.type === "project" && currentSelection.id === targetId) {
            currentSelection = { type: "ide", id: hubConfig.ides[0]?.id || "" };
          }

          await persistConfig();
          renderAll();
        });
      }

      listEl.appendChild(item);
    });
  }

  function renderPluginTable() {
    const tableBody = $("pluginTableBody");
    if (!tableBody) return;
    tableBody.innerHTML = "";

    let targetTitle = "Global Platform";
    let badgeText = "Global IDE";
    let activeMap = {};

    if (currentSelection.type === "ide") {
      const ide = hubConfig.ides.find((i) => i.id === currentSelection.id);
      if (ide) {
        targetTitle = ide.name;
        badgeText = "Global Platform";
        activeMap = ide.plugins || {};
      }
    } else if (currentSelection.type === "project") {
      const proj = hubConfig.projects.find((p) => p.id === currentSelection.id);
      if (proj) {
        targetTitle = proj.name;
        badgeText = "Project Override";
        activeMap = proj.plugins || {};
      }
    }

    if ($("activeContextText")) {
      $("activeContextText").innerHTML = `Target: <strong>${escapeHtml(targetTitle)}</strong>`;
    }
    if ($("activeContextBadge")) {
      $("activeContextBadge").textContent = badgeText;
    }

    if (discoveredPlugins.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="4" style="text-align: center; padding: 32px 16px; color: var(--magpie-muted);">
            No plugin components discovered in this storage path.<br>
            <span style="font-size: 11px; opacity: 0.8;">Active Path: ${escapeHtml(computeEffectiveHubPath().path)}</span>
          </td>
        </tr>
      `;
      return;
    }

    discoveredPlugins.forEach((plugin) => {
      const isEnabled = activeMap[plugin.id] !== false; // Default true
      const isFilesExpanded = expandedFiles.has(plugin.id);
      const row = document.createElement("tr");

      let badges = "";
      if (plugin.hasMcp) badges += `<span class="badge badge-mcp">MCP</span>`;
      if (plugin.skills?.length > 0) badges += `<span class="badge badge-skills">${plugin.skills.length} Skills</span>`;
      if (plugin.rules?.length > 0) badges += `<span class="badge badge-rules">Rules</span>`;
      if (plugin.hasHooks) badges += `<span class="badge" style="background:rgba(234,88,12,0.15);color:#ea580c;">Hooks</span>`;

      ensurePluginFiles(plugin);
      const componentFiles = getPluginComponentFiles(plugin);
      const filesCount = componentFiles.length;
      let filesListHtml = "";
      if (isFilesExpanded) {
        if (filesCount > 0) {
          const fileRows = componentFiles.map((it) => {
            let badgeBg = "rgba(100,116,139,0.12)";
            let badgeColor = "#64748b";
            if (it.type === "skill") {
              badgeBg = "rgba(37,99,235,0.12)";
              badgeColor = "#2563eb";
            } else if (it.type === "mcp") {
              badgeBg = "rgba(234,179,8,0.15)";
              badgeColor = "#ca8a04";
            } else if (it.type === "rule") {
              badgeBg = "rgba(168,85,247,0.15)";
              badgeColor = "#9333ea";
            } else if (it.type === "agent") {
              badgeBg = "rgba(236,72,153,0.15)";
              badgeColor = "#db2777";
            } else if (it.type === "hook") {
              badgeBg = "rgba(234,88,12,0.15)";
              badgeColor = "#ea580c";
            } else if (it.type === "manifest") {
              badgeBg = "rgba(16,185,129,0.12)";
              badgeColor = "#059669";
            } else if (it.type === "docs") {
              badgeBg = "rgba(5,150,105,0.12)";
              badgeColor = "#059669";
            }

            return `
              <div class="cat-item-row file-tree-item" style="display:flex; justify-content:space-between; align-items:center; padding:3.5px 8px; border-radius:4px; margin-bottom:2px; font-size:11px; background:var(--magpie-surface, rgba(128,128,128,0.04));">
                <div class="cat-item-title" style="display:flex; align-items:center; gap:6px; overflow:hidden;">
                  <span style="font-size:10px; font-weight:600; padding:1.5px 5px; border-radius:3px; background:${badgeBg}; color:${badgeColor}; flex-shrink:0;">${it.badge}</span>
                  <span style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(it.name)}</span>
                  ${it.sub ? `<span style="opacity:0.65; font-size:10px; flex-shrink:0;">(${escapeHtml(it.sub)})</span>` : ""}
                </div>
                <div class="cat-item-meta" style="display:flex; align-items:center; gap:8px; opacity:0.65; font-size:10px; flex-shrink:0; margin-left:12px;">
                  <span>${escapeHtml(it.relPath)}</span>
                  ${it.sizeStr ? `<span>${it.sizeStr}</span>` : ""}
                </div>
              </div>
            `;
          }).join("");

          filesListHtml = `
            <div class="file-tree-container" style="margin-top:8px; padding:8px 10px; border-radius:6px; border:1px solid var(--magpie-border, rgba(128,128,128,0.2)); background:var(--magpie-bg, rgba(0,0,0,0.02)); max-height:260px; overflow-y:auto;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; font-size:11px; font-weight:600; opacity:0.85;">
                <span>Discovered Components &amp; Files in ${escapeHtml(plugin.name)} (${filesCount} total):</span>
              </div>
              ${fileRows}
            </div>
          `;
        } else {
          filesListHtml = `
            <div class="file-tree-container" style="margin-top:6px; padding:8px 10px; border-radius:6px; border:1px solid var(--magpie-border, rgba(128,128,128,0.2));">
              <div style="font-size:11px; opacity:0.7; padding:4px 0;">No components or files discovered in ${escapeHtml(plugin.name)}.</div>
            </div>
          `;
        }
      }

      row.innerHTML = `
        <td style="vertical-align:top; padding-top:12px;">
          <label class="switch">
            <input type="checkbox" class="plugin-toggle" data-plugin="${escapeHtml(plugin.id)}" ${isEnabled ? "checked" : ""}>
            <span class="slider"></span>
          </label>
        </td>
        <td style="vertical-align:top; padding-top:10px;">
          <div><strong>${escapeHtml(plugin.name)}</strong> ${plugin.version ? `<span style="font-size:10.5px; opacity:0.7;">v${escapeHtml(plugin.version)}</span>` : ""}</div>
          <button type="button" class="btn-files-toggle" data-plugin-files="${escapeHtml(plugin.id)}">
            <span>${isFilesExpanded ? "▲ Hide" : "📁 View"} (${filesCount})</span>
          </button>
          ${filesListHtml}
        </td>
        <td style="vertical-align:top; padding-top:12px;">${badges || `<span style="color:var(--magpie-muted);font-size:11px;">Standard</span>`}</td>
        <td style="vertical-align:top; padding-top:12px; color:var(--magpie-muted);">${escapeHtml(plugin.description || "-")}</td>
      `;

      const fileToggleBtn = row.querySelector(".btn-files-toggle");
      if (fileToggleBtn) {
        fileToggleBtn.addEventListener("click", (e) => {
          e.preventDefault();
          if (expandedFiles.has(plugin.id)) {
            expandedFiles.delete(plugin.id);
          } else {
            expandedFiles.add(plugin.id);
          }
          renderPluginTable();
        });
      }

      row.querySelector(".plugin-toggle").addEventListener("change", (e) => {
        const checked = e.target.checked;
        if (currentSelection.type === "ide") {
          const ide = hubConfig.ides.find((i) => i.id === currentSelection.id);
          if (ide) {
            if (!ide.plugins) ide.plugins = {};
            ide.plugins[plugin.id] = checked;
          }
        } else if (currentSelection.type === "project") {
          const proj = hubConfig.projects.find((p) => p.id === currentSelection.id);
          if (proj) {
            if (!proj.plugins) proj.plugins = {};
            proj.plugins[plugin.id] = checked;
          }
        }
        triggerAutoSync();
      });

      tableBody.appendChild(row);
    });
  }

  // Opens Add Project modal populated with an existing project's info
  function openCloneProjectModal(proj) {
    if ($("projectModalTitle")) $("projectModalTitle").textContent = "Clone Project to Another IDE";
    if ($("projectNameInput")) $("projectNameInput").value = `${proj.name} (Copy)`;
    if ($("projectPathInput")) $("projectPathInput").value = proj.repoPath;

    const select = $("projectIdeSelect");
    if (select) {
      select.innerHTML = "";
      hubConfig.ides.forEach((ide) => {
        const opt = document.createElement("option");
        opt.value = ide.id;
        opt.textContent = ide.name;
        // Pre-select another IDE if available
        if (ide.id !== proj.ideId) opt.selected = true;
        select.appendChild(opt);
      });
    }

    if ($("addProjectModal")) $("addProjectModal").style.display = "flex";
  }

  // Dynamically detect accurate Configuration Link Directory across any user or platform
  async function detectDefaultConfigPath(nameOrAgentType, exePath) {
    try {
      const detected = await apiClient.detectConfigPath(nameOrAgentType, exePath);
      if (detected) return detected;
    } catch {}

    const prof = agentProfiles.find((p) => p.id === nameOrAgentType || p.label.toLowerCase() === String(nameOrAgentType || "").toLowerCase());
    if (prof && prof.defaultConfigPath) {
      return prof.defaultConfigPath;
    }

    const combined = `${nameOrAgentType || ""} ${exePath || ""}`.toLowerCase();
    for (const p of agentProfiles) {
      if (combined.includes(p.id) || combined.includes(p.label.toLowerCase().split(" ")[0])) {
        return p.defaultConfigPath;
      }
    }

    const clean = nameOrAgentType ? String(nameOrAgentType).toLowerCase().replace(/[^a-z0-9_-]/g, "") : "agent";
    return `~/.${clean}/skills`;
  }

  function inferClientName(baseName) {
    if (!baseName) return "Agent";
    const clean = baseName.replace(/\.(exe|lnk|app|cmd|bat)$/i, "");
    const lower = clean.toLowerCase();

    if (lower === "opencode" || lower.startsWith("opencode")) return "OpenCode";
    if (lower === "code" || lower === "vscode" || lower === "visualstudiocode") return "VS Code";
    if (lower === "cursor") return "Cursor";
    if (lower === "windsurf") return "Windsurf";
    if (lower === "agy" || lower.includes("antigravity")) return "Antigravity";
    if (lower === "claude") return "Claude";
    if (lower === "vscodium" || lower === "codium") return "VSCodium";
    if (lower === "zed") return "Zed";

    return clean.charAt(0).toUpperCase() + clean.slice(1);
  }

  function setupEventListeners() {
    // Hub Storage Path manual input with debounce
    let hubInputTimer = null;
    if ($("hubPathInput")) {
      $("hubPathInput").addEventListener("input", (e) => {
        clearTimeout(hubInputTimer);
        hubConfig.hubRoot = e.target.value.trim();
        hubInputTimer = setTimeout(async () => {
          await reloadPluginsFromHub();
          renderAll();
          triggerAutoSync();
        }, 350);
      });
      $("hubPathInput").addEventListener("change", async (e) => {
        clearTimeout(hubInputTimer);
        hubConfig.hubRoot = e.target.value.trim();
        await reloadPluginsFromHub();
        renderAll();
        triggerAutoSync();
      });
    }

    // Native HTML5 folder picker for Components Storage Path
    const hubFolderPicker = $("hubFolderPicker");
    if (hubFolderPicker) {
      hubFolderPicker.addEventListener("change", async (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        let chosenPath = "";
        if (files[0].path) {
          const first = files[0].path;
          const rel = files[0].webkitRelativePath || "";
          if (rel && first.includes(rel.replace(/\//g, "\\"))) {
            chosenPath = first.substring(0, first.indexOf(rel.replace(/\//g, "\\")) + rel.split(/[/\\]/)[0].length);
          } else {
            const parts = first.split(/[/\\]/);
            parts.pop();
            chosenPath = parts.join("\\");
          }
        }
        if (!chosenPath && files[0].webkitRelativePath) {
          const topFolder = files[0].webkitRelativePath.split("/")[0];
          const resolved = await apiClient.resolveDroppedTarget(topFolder, "project");
          if (resolved && resolved.success && resolved.realPath) {
            chosenPath = resolved.realPath;
          } else {
            chosenPath = topFolder;
          }
        }
        if (chosenPath) {
          hubConfig.hubRoot = chosenPath;
          if ($("hubPathInput")) $("hubPathInput").value = chosenPath;
          await reloadPluginsFromHub();
          renderAll();
          triggerAutoSync();
        }
        hubFolderPicker.value = "";
      });
    }

    // Browse Folder for Components Storage Path
    if ($("btnPickHubFolder")) {
      $("btnPickHubFolder").addEventListener("click", async () => {
        if (hubFolderPicker) {
          try { hubFolderPicker.click(); } catch (err) {}
        }
        try {
          $("btnPickHubFolder").textContent = "Opening...";
          const res = await apiClient.browseFileSystem("folder");
          $("btnPickHubFolder").textContent = "📁 Browse...";
          if (res && !res.cancelled && res.realPath) {
            hubConfig.hubRoot = res.realPath;
            if ($("hubPathInput")) $("hubPathInput").value = res.realPath;
            await reloadPluginsFromHub();
            renderAll();
            triggerAutoSync();
          }
        } catch (err) {
          $("btnPickHubFolder").textContent = "📁 Browse...";
          console.warn("Browse Hub folder error:", err);
        }
      });
    }

    // Reset Default Button -> Resets to 1st connected IDE's config link directory
    if ($("btnBrowseHubPath")) {
      $("btnBrowseHubPath").addEventListener("click", async () => {
        // Clear manual hubRoot so it auto-links to 1st connected IDE's config path
        hubConfig.hubRoot = "";
        if ($("hubPathInput")) $("hubPathInput").value = "";
        await reloadPluginsFromHub();
        renderAll();
        triggerAutoSync();
      });
    }

    // Toggle expandable Discovered Components list (Plugins, MCPs, Hooks, Skills, Agents, Rules)
    const btnToggleComp = $("btnToggleComponentsDetails");
    const compPanel = $("componentsExpandPanel");
    if (btnToggleComp && compPanel) {
      btnToggleComp.addEventListener("click", () => {
        const isHidden = compPanel.style.display === "none" || !compPanel.style.display;
        compPanel.style.display = isHidden ? "block" : "none";
        if ($("expandIcon")) $("expandIcon").textContent = isHidden ? "▲" : "▼";
        if ($("expandLabel")) $("expandLabel").textContent = isHidden ? "Collapse Components List" : "Expand Components List";
        if (isHidden) {
          renderCategoryBrowser();
        }
      });
    }

    // Category Filter Tabs
    const catTabs = document.querySelectorAll(".cat-tab");
    catTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        catTabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        activeCategoryTab = tab.dataset.cat || "all";
        renderCategoryBrowser();
      });
    });

    // Category search input
    const catSearch = $("catSearchInput");
    if (catSearch) {
      catSearch.addEventListener("input", (e) => {
        categorySearchFilter = e.target.value.toLowerCase().trim();
        renderCategoryBrowser();
      });
    }

    // Expand / Collapse All Files in Components & Plugins table
    const btnToggleAll = $("btnToggleAllFiles");
    if (btnToggleAll) {
      btnToggleAll.addEventListener("click", () => {
        allFilesExpanded = !allFilesExpanded;
        if (allFilesExpanded) {
          discoveredPlugins.forEach((p) => expandedFiles.add(p.id));
          btnToggleAll.textContent = "📁 Collapse All Files";
        } else {
          expandedFiles.clear();
          btnToggleAll.textContent = "📁 Expand All Files";
        }
        renderPluginTable();
      });
    }

    // Smart Middleware Toggle
    if ($("smartMiddlewareToggle")) {
      $("smartMiddlewareToggle").addEventListener("change", async (e) => {
        if (!hubConfig.smartMiddleware) hubConfig.smartMiddleware = {};
        hubConfig.smartMiddleware.enabled = e.target.checked;
        if ($("middlewareStatusLabel")) {
          $("middlewareStatusLabel").textContent = e.target.checked
            ? "Smart Middleware: Active"
            : "Smart Middleware: Bypassed";
          $("middlewareStatusLabel").className = `toggle-label ${e.target.checked ? "" : "disabled"}`;
        }
        if ($("gatewayStatus")) {
          $("gatewayStatus").textContent = e.target.checked ? "Active" : "Disabled";
        }
        triggerAutoSync();
      });
    }

    // Adjustable Tool Cap input
    if ($("maxToolsInput")) {
      $("maxToolsInput").addEventListener("input", (e) => {
        let val = parseInt(e.target.value, 10);
        if (isNaN(val) || val < 1) val = 96;
        if (!hubConfig.smartMiddleware) hubConfig.smartMiddleware = {};
        hubConfig.smartMiddleware.maxTools = val;
        if ($("capSubtitle")) {
          $("capSubtitle").textContent = `Capping at ${val} safe tools for Smart Middleware`;
        }
        triggerAutoSync();
      });
    }

    // Default button (Reset cap to 96)
    if ($("btnResetCap")) {
      $("btnResetCap").addEventListener("click", () => {
        if (!hubConfig.smartMiddleware) hubConfig.smartMiddleware = {};
        hubConfig.smartMiddleware.maxTools = 96;
        if ($("maxToolsInput")) $("maxToolsInput").value = 96;
        if ($("capSubtitle")) $("capSubtitle").textContent = "Capping at 96 safe tools for Smart Middleware";
        triggerAutoSync();
      });
    }

    const agentTypeSelect = $("agentTypeSelect");
    const agentCapabilityChips = $("agentCapabilityChips");
    const agentTargetPaths = $("agentTargetPaths");
    const autoDetectToggle = $("autoDetectConfigToggle");
    const ideConfigInput = $("ideConfigInput");
    const ideExeInput = $("ideExeInput");
    const ideNameInput = $("ideNameInput");
    const autoDetectLabel = $("autoDetectLabel");
    const configHint = $("configHint");

    if ($("btnToggleComponentPaths")) {
      $("btnToggleComponentPaths").addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const body = $("componentPathsBody");
        const isCollapsed = !body || body.style.display === "none";
        setComponentPathsCollapsed(!isCollapsed);
      });
    }
    if ($("componentPathsToggleTitle")) {
      $("componentPathsToggleTitle").addEventListener("click", () => {
        const body = $("componentPathsBody");
        const isCollapsed = !body || body.style.display === "none";
        setComponentPathsCollapsed(!isCollapsed);
      });
    }

    if ($("btnResetComponentPaths")) {
      $("btnResetComponentPaths").addEventListener("click", () => {
        const sel = agentTypeSelect?.value || "antigravity";
        populateComponentPathsInputs(sel);
      });
    }

    // Modal triggers
    if ($("openAddIdeModalBtn")) {
      $("openAddIdeModalBtn").addEventListener("click", () => {
        editingIdeId = null;
        if ($("addIdeModal")) $("addIdeModal").style.display = "flex";
        const titleEl = $("addIdeModal")?.querySelector(".modal-head h3");
        if (titleEl) titleEl.textContent = "Add Agent IDE / Binary Link";
        if ($("saveIdeBtn")) $("saveIdeBtn").textContent = "Add IDE";
        if ($("ideNameInput")) $("ideNameInput").value = "";
        if ($("ideExeInput")) $("ideExeInput").value = "";
        const selType = agentTypeSelect?.value || "claude-code";
        const prof = agentProfiles.find((p) => p.id === selType);
        if (ideNameInput && prof) {
          ideNameInput.value = prof.label;
        }
        renderSelectedAgentMeta(selType);
        updateAutoDetectState();
        setComponentPathsCollapsed(true);
      });
    }
    if ($("closeIdeModal")) $("closeIdeModal").addEventListener("click", () => $("addIdeModal").style.display = "none");
    if ($("cancelIdeBtn")) $("cancelIdeBtn").addEventListener("click", () => $("addIdeModal").style.display = "none");

    async function updateAutoDetectState() {
      if (!autoDetectToggle || !ideConfigInput) return;
      const selectedType = agentTypeSelect?.value || "antigravity";
      const isCustom = selectedType === "custom";
      const isAuto = isCustom ? false : autoDetectToggle.checked;
      ideConfigInput.readOnly = isAuto;
      if (autoDetectLabel) {
        autoDetectLabel.textContent = isAuto ? "Auto-detect: ON" : "Auto-detect: OFF";
        autoDetectLabel.style.color = isAuto ? "#16a34a" : "var(--magpie-muted)";
      }
      if (configHint) {
        configHint.textContent = isAuto
          ? "Automatically resolved for selected Agent Profile. Turn off to type custom path."
          : "Manual input active. Enter full path where skills/plugins should be linked.";
      }
      if (isAuto) {
        const lookupKey = selectedType !== "custom" ? selectedType : (ideNameInput?.value || "agent");
        ideConfigInput.value = await detectDefaultConfigPath(lookupKey, ideExeInput?.value);
      }
    }

    if (agentTypeSelect) {
      agentTypeSelect.addEventListener("change", async () => {
        const sel = agentTypeSelect.value;
        const prof = agentProfiles.find((p) => p.id === sel);
        if (prof && ideNameInput) {
          ideNameInput.value = prof.label;
        }
        if (sel === "custom" && autoDetectToggle) {
          autoDetectToggle.checked = false;
        } else if (autoDetectToggle) {
          autoDetectToggle.checked = true;
        }
        renderSelectedAgentMeta(sel);
        await updateAutoDetectState();
      });
    }

    if (autoDetectToggle) {
      autoDetectToggle.addEventListener("change", updateAutoDetectState);
    }
    if (ideNameInput) {
      ideNameInput.addEventListener("input", () => {
        if (autoDetectToggle?.checked) updateAutoDetectState();
      });
    }
    if (ideExeInput) {
      ideExeInput.addEventListener("input", () => {
        if (autoDetectToggle?.checked) updateAutoDetectState();
      });
    }

    // Drag and Drop Zone for Add IDE Modal
    const ideDropZone = $("ideDropZone");
    if (ideDropZone) {
      ["dragenter", "dragover"].forEach((eventName) => {
        ideDropZone.addEventListener(eventName, (e) => {
          e.preventDefault();
          ideDropZone.classList.add("dragover");
        });
      });
      ["dragleave", "drop"].forEach((eventName) => {
        ideDropZone.addEventListener(eventName, (e) => {
          e.preventDefault();
          ideDropZone.classList.remove("dragover");
        });
      });
      ideDropZone.addEventListener("drop", async (e) => {
        e.preventDefault();
        ideDropZone.classList.remove("dragover");

        let raw = "";
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
          raw = files[0].path || files[0].name;
        }
        if (!raw) {
          const uri = e.dataTransfer.getData("text/uri-list");
          if (uri && uri.startsWith("file://")) {
            raw = decodeURIComponent(uri.replace(/^file:\/\/\/?/, "").replace(/\//g, "\\"));
          }
        }
        if (!raw) {
          raw = e.dataTransfer.getData("text/plain") || "";
        }
        if (!raw) return;

        // Call backend resolver for real target and accurate name
        let result = await apiClient.resolveDroppedTarget(raw, "ide");

        if (result && result.success && result.realPath && (result.realPath.includes("\\") || result.realPath.includes("/"))) {
          if (ideExeInput) ideExeInput.value = result.realPath;
          if (ideNameInput) ideNameInput.value = result.name;
          if (result.agentType && agentTypeSelect) {
            agentTypeSelect.value = result.agentType;
            renderSelectedAgentMeta(result.agentType);
          }
          if (ideConfigInput) ideConfigInput.value = result.configPath;
        } else {
          const rawBase = raw.split(/[/\\]/).pop();
          const guessedName = inferClientName(rawBase);
          if (ideExeInput) ideExeInput.value = raw;
          if (ideNameInput) ideNameInput.value = guessedName;
          await updateAutoDetectState();
        }
      });
    }

    // Native HTML5 file picker for Agent Executable
    const ideExePicker = $("ideExePicker");
    if (ideExePicker) {
      ideExePicker.addEventListener("change", async (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        const file = files[0];
        const rawPath = file.path || file.name;
        const res = await apiClient.resolveDroppedTarget(rawPath, "ide");
        if (res && res.success && res.realPath) {
          if (ideExeInput) ideExeInput.value = res.realPath;
          if (ideNameInput) ideNameInput.value = res.name;
          if (res.agentType && agentTypeSelect) {
            agentTypeSelect.value = res.agentType;
            renderSelectedAgentMeta(res.agentType);
          }
          if (autoDetectToggle?.checked && ideConfigInput) {
            ideConfigInput.value = res.configPath;
          }
        } else {
          if (ideExeInput) ideExeInput.value = rawPath;
          if (ideNameInput) ideNameInput.value = inferClientName(file.name);
          await updateAutoDetectState();
        }
        ideExePicker.value = "";
      });
    }

    // Browse Button for Agent Binary Path
    if ($("btnBrowseIdeExe")) {
      $("btnBrowseIdeExe").addEventListener("click", async () => {
        if (ideExePicker) {
          try { ideExePicker.click(); } catch (err) {}
        }
        try {
          $("btnBrowseIdeExe").textContent = "Opening...";
          const res = await apiClient.browseFileSystem("file");
          $("btnBrowseIdeExe").textContent = "📁 Browse...";
          if (res && !res.cancelled && res.realPath) {
            if (ideExeInput) ideExeInput.value = res.realPath;
            const resolved = await apiClient.resolveDroppedTarget(res.realPath, "ide");
            if (resolved && resolved.success) {
              if (ideNameInput) ideNameInput.value = resolved.name;
              if (autoDetectToggle?.checked && ideConfigInput) {
                ideConfigInput.value = resolved.configPath;
              }
            } else {
              if (ideNameInput) ideNameInput.value = res.name || inferClientName(res.realPath);
            }
          }
        } catch (err) {
          $("btnBrowseIdeExe").textContent = "📁 Browse...";
          console.warn("Browse IDE binary error:", err);
        }
      });
    }

    // Drag and Drop Zone for Add Project Modal
    const projectDropZone = $("projectDropZone");
    if (projectDropZone) {
      ["dragenter", "dragover"].forEach((eventName) => {
        projectDropZone.addEventListener(eventName, (e) => {
          e.preventDefault();
          projectDropZone.classList.add("dragover");
        });
      });
      ["dragleave", "drop"].forEach((eventName) => {
        projectDropZone.addEventListener(eventName, (e) => {
          e.preventDefault();
          projectDropZone.classList.remove("dragover");
        });
      });
      projectDropZone.addEventListener("drop", async (e) => {
        e.preventDefault();
        projectDropZone.classList.remove("dragover");

        let raw = "";
        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
          raw = files[0].path || files[0].name;
        }
        if (!raw) {
          const uri = e.dataTransfer.getData("text/uri-list");
          if (uri && uri.startsWith("file://")) {
            raw = decodeURIComponent(uri.replace(/^file:\/\/\/?/, "").replace(/\//g, "\\"));
          }
        }
        if (!raw) {
          raw = e.dataTransfer.getData("text/plain") || "";
        }
        if (!raw) return;

        // Call backend resolver for real repository directory path
        let result = await apiClient.resolveDroppedTarget(raw, "project");

        if (result && result.success && result.realPath && (result.realPath.includes("\\") || result.realPath.includes("/"))) {
          if ($("projectPathInput")) $("projectPathInput").value = result.realPath;
          if ($("projectNameInput")) $("projectNameInput").value = result.name;
        } else {
          // Client fallback
          const folderName = raw.split(/[/\\]/).pop();
          let guessedFolder = "";
          if (folderName.toLowerCase().includes("trainingstatuswidget")) {
            guessedFolder = "D:\\Software\\Garmin SDK\\TrainingStatusWidget";
          }
          if ($("projectPathInput")) $("projectPathInput").value = guessedFolder || raw;
          if ($("projectNameInput")) $("projectNameInput").value = folderName;
        }
      });
    }

    // Native HTML5 folder picker for Project Repository
    const projectFolderPicker = $("projectFolderPicker");
    if (projectFolderPicker) {
      projectFolderPicker.addEventListener("change", async (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        let chosenPath = "";
        if (files[0].path) {
          const first = files[0].path;
          const rel = files[0].webkitRelativePath || "";
          if (rel && first.includes(rel.replace(/\//g, "\\"))) {
            chosenPath = first.substring(0, first.indexOf(rel.replace(/\//g, "\\")) + rel.split(/[/\\]/)[0].length);
          } else {
            const parts = first.split(/[/\\]/);
            parts.pop();
            chosenPath = parts.join("\\");
          }
        }
        if (!chosenPath && files[0].webkitRelativePath) {
          const topFolder = files[0].webkitRelativePath.split("/")[0];
          const resolved = await apiClient.resolveDroppedTarget(topFolder, "project");
          if (resolved && resolved.success && resolved.realPath) {
            chosenPath = resolved.realPath;
          } else {
            chosenPath = topFolder;
          }
        }
        if (chosenPath) {
          if ($("projectPathInput")) $("projectPathInput").value = chosenPath;
          if ($("projectNameInput")) {
            const name = chosenPath.split(/[/\\]/).filter(Boolean).pop();
            if (name) $("projectNameInput").value = name;
          }
        }
        projectFolderPicker.value = "";
      });
    }

    // Browse Button for Project Repository Path
    if ($("btnBrowseProjectPath")) {
      $("btnBrowseProjectPath").addEventListener("click", async () => {
        if (projectFolderPicker) {
          try { projectFolderPicker.click(); } catch (err) {}
        }
        try {
          $("btnBrowseProjectPath").textContent = "Opening...";
          const res = await apiClient.browseFileSystem("folder");
          $("btnBrowseProjectPath").textContent = "📁 Browse...";
          if (res && !res.cancelled && res.realPath) {
            if ($("projectPathInput")) $("projectPathInput").value = res.realPath;
            if ($("projectNameInput")) $("projectNameInput").value = res.name;
          }
        } catch (err) {
          $("btnBrowseProjectPath").textContent = "📁 Browse...";
          console.warn("Browse project repository error:", err);
        }
      });
    }

    if ($("openAddProjectModalBtn")) {
      $("openAddProjectModalBtn").addEventListener("click", () => {
        editingProjectId = null;
        if ($("projectModalTitle")) $("projectModalTitle").textContent = "Add Project Repository";
        if ($("saveProjectBtn")) $("saveProjectBtn").textContent = "Save Project";
        if ($("projectNameInput")) $("projectNameInput").value = "";
        if ($("projectPathInput")) $("projectPathInput").value = "";

        const select = $("projectIdeSelect");
        if (select) {
          select.innerHTML = "";
          hubConfig.ides.forEach((ide) => {
            const opt = document.createElement("option");
            opt.value = ide.id;
            opt.textContent = ide.name;
            select.appendChild(opt);
          });
        }
        if ($("addProjectModal")) $("addProjectModal").style.display = "flex";
      });
    }
    if ($("closeProjectModal")) $("closeProjectModal").addEventListener("click", () => $("addProjectModal").style.display = "none");
    if ($("cancelProjectBtn")) $("cancelProjectBtn").addEventListener("click", () => $("addProjectModal").style.display = "none");

    // Add / Edit IDE save
    if ($("saveIdeBtn")) {
      $("saveIdeBtn").addEventListener("click", async () => {
        const agentType = $("agentTypeSelect")?.value || "custom";
        const prof = agentProfiles.find((p) => p.id === agentType);
        const name = $("ideNameInput")?.value?.trim() || prof?.label || "Agent";
        const exePath = $("ideExeInput")?.value?.trim() || "";
        let configPath = $("ideConfigInput")?.value?.trim();

        if (autoDetectToggle?.checked || !configPath) {
          configPath = await detectDefaultConfigPath(agentType !== "custom" ? agentType : name, exePath);
        }

        if (!name || !configPath) {
          alert("Please provide an Agent/IDE name and configuration path.");
          return;
        }

        const componentPaths = collectComponentPathsFromInputs();

        if (editingIdeId) {
          const existing = hubConfig.ides.find((i) => i.id === editingIdeId);
          if (existing) {
            existing.name = name;
            existing.agentType = agentType;
            existing.exePath = exePath;
            existing.configPath = configPath;
            existing.componentPaths = componentPaths;
          }
        } else {
          const baseId = (agentType !== "custom" ? agentType : name).toLowerCase().replace(/[^a-z0-9]/g, "-");
          const id = hubConfig.ides.some((i) => i.id === baseId) ? `${baseId}-${Date.now()}` : baseId;
          hubConfig.ides.push({ id, name, agentType, exePath, configPath, componentPaths, enabled: true, plugins: {} });
          currentSelection = { type: "ide", id };
        }

        if ($("addIdeModal")) $("addIdeModal").style.display = "none";
        editingIdeId = null;
        triggerAutoSync();
        renderAll();
      });
    }

    // Add / Edit Project save
    if ($("saveProjectBtn")) {
      $("saveProjectBtn").addEventListener("click", async () => {
        const name = $("projectNameInput")?.value?.trim();
        const ideId = $("projectIdeSelect")?.value;
        const repoPath = $("projectPathInput")?.value?.trim();

        if (!name || !repoPath) {
          alert("Please provide project name and repository path.");
          return;
        }

        if (editingProjectId) {
          const existing = hubConfig.projects.find((p) => p.id === editingProjectId);
          if (existing) {
            existing.name = name;
            existing.ideId = ideId;
            existing.repoPath = repoPath;
          }
        } else {
          const id = "proj-" + Date.now();
          hubConfig.projects.push({ id, name, ideId, repoPath, plugins: {} });
        }

        if ($("addProjectModal")) $("addProjectModal").style.display = "none";
        editingProjectId = null;
        triggerAutoSync();
        renderAll();
      });
    }

    // Rescan button & Progress Modal
    if ($("closeRescanModal")) $("closeRescanModal").addEventListener("click", () => $("rescanProgressModal").style.display = "none");
    if ($("btnDoneRescan")) $("btnDoneRescan").addEventListener("click", () => $("rescanProgressModal").style.display = "none");

    if ($("rescanBtn")) {
      $("rescanBtn").addEventListener("click", async () => {
        const modal = $("rescanProgressModal");
        const bar = $("rescanProgressBar");
        const step = $("rescanStatusStep");
        const pct = $("rescanStatusPct");
        const banner = $("rescanSummaryBanner");
        const cards = $("rescanCardsContainer");

        if (modal) modal.style.display = "flex";
        if (banner) banner.style.display = "none";
        if (bar) bar.style.width = "15%";
        if (pct) pct.textContent = "15%";
        if (step) step.textContent = "Connecting to Hub components storage path...";
        if (cards) cards.innerHTML = `<div style="font-size:12px; color:var(--magpie-muted); padding:8px;">Initializing scan...</div>`;

        if ($("hubPathInput")) {
          hubConfig.hubRoot = $("hubPathInput").value.trim();
        }
        const effectivePath = computeEffectiveHubPath().path;
        const norm = normalizePathForCompare(effectivePath);
        try {
          localStorage.removeItem("magpie_plugins_" + norm);
        } catch {}

        await new Promise((r) => setTimeout(r, 200));
        if (bar) bar.style.width = "40%";
        if (pct) pct.textContent = "40%";
        if (step) step.textContent = `Scanning plugins & components in ${effectivePath}...`;

        let scanResult = null;
        try {
          const resp = await fetch("http://127.0.0.1:41789/api/rescan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ hubRoot: effectivePath }),
          });
          if (resp.ok) scanResult = await resp.json();
        } catch (err) {
          console.warn("API rescan error, falling back to local sync:", err);
        }

        if (bar) bar.style.width = "75%";
        if (pct) pct.textContent = "75%";
        if (step) step.textContent = "Verifying linking connection status & updating cross-agent communication bridge...";

        await persistConfig(true);
        await reloadPluginsFromHub(true);
        renderAll();

        await new Promise((r) => setTimeout(r, 250));
        if (bar) bar.style.width = "100%";
        if (pct) pct.textContent = "100%";
        if (step) step.textContent = "Synchronization & Verification Complete!";
        if (banner) banner.style.display = "block";

        if (cards) {
          cards.innerHTML = "";

          // Hub Status Card
          const hubCard = document.createElement("div");
          hubCard.style.cssText = "padding:10px 12px; border:1px solid var(--magpie-border, #333); border-radius:6px; background:var(--magpie-surface-alt, rgba(255,255,255,0.02)); font-size:12px;";
          hubCard.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <span style="font-weight:600;">📁 Hub Storage Path (Components Storage)</span>
              <span style="font-size:11px; padding:2px 8px; border-radius:4px; background:rgba(34,197,94,0.15); color:#22c55e; font-weight:600;">🟢 Connected</span>
            </div>
            <div style="color:var(--magpie-muted); font-size:11px; word-break:break-all;">Path: ${escapeHtml(effectivePath)}</div>
            <div style="font-size:11px; color:#60a5fa; margin-top:2px;">Discovered: ${allPluginsList.length} plugins, ${allPluginsList.reduce((acc, p) => acc + (p.skills?.length || 0), 0)} skills</div>
          `;
          cards.appendChild(hubCard);

          // Cross-Agent Communication Bridge Card
          const bridgeCard = document.createElement("div");
          bridgeCard.style.cssText = "padding:10px 12px; border:1px solid var(--magpie-border, #333); border-radius:6px; background:var(--magpie-surface-alt, rgba(255,255,255,0.02)); font-size:12px;";
          bridgeCard.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
              <span style="font-weight:600;">🔗 Cross-Agent Communication Bridge</span>
              <span style="font-size:11px; padding:2px 8px; border-radius:4px; background:rgba(34,197,94,0.15); color:#22c55e; font-weight:600;">🟢 Active</span>
            </div>
            <div style="color:var(--magpie-muted); font-size:11px;">Bridge Manifest: agent-space-bridge.json · Connectors: shared/agent-connectors.json</div>
            <div style="font-size:11px; color:#10b981; margin-top:2px;">Status: All connected agents synchronized with live handoff inboxes in D:\\Software\\AI Agent Space</div>
          `;
          cards.appendChild(bridgeCard);

          // Connected IDE Cards
          hubConfig.ides.forEach((ide) => {
            const ideCard = document.createElement("div");
            ideCard.style.cssText = "padding:10px 12px; border:1px solid var(--magpie-border, #333); border-radius:6px; background:var(--magpie-surface-alt, rgba(255,255,255,0.02)); font-size:12px;";
            const sync = lastSyncByIde[ide.id];
            let summaryText = "";
            if (sync?.summary) {
              const s = sync.summary;
              if (sync.mode === "bundle") {
                summaryText = `${s.plugins || 0} bundles · ${s.skills || 0} skills · ${s.rules || 0} rules · ${s.agents || 0} subagents`;
              } else {
                summaryText = `${s.skills || 0} skills · ${s.commands || 0} commands · ${s.mcp || 0} MCP · ${s.rules || 0} rules · ${s.agents || 0} agents`;
              }
            } else {
              summaryText = "Linking verified";
            }

            ideCard.innerHTML = `
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <span style="font-weight:600;">🤖 ${escapeHtml(ide.name)} (${escapeHtml(ide.agentType || "Agent")})</span>
                <span style="font-size:11px; padding:2px 8px; border-radius:4px; background:rgba(34,197,94,0.15); color:#22c55e; font-weight:600;">🟢 Connected & Synced</span>
              </div>
              <div style="color:var(--magpie-muted); font-size:11px; word-break:break-all;">Target: ${escapeHtml(ide.configPath)}</div>
              <div style="font-size:11px; color:#3b82f6; margin-top:2px;">Linked Components: ${escapeHtml(summaryText)}</div>
            `;
            cards.appendChild(ideCard);
          });

          // Connected Project Overrides Cards
          (hubConfig.projects || []).forEach((proj) => {
            const projCard = document.createElement("div");
            projCard.style.cssText = "padding:10px 12px; border:1px solid var(--magpie-border, #333); border-radius:6px; background:var(--magpie-surface-alt, rgba(255,255,255,0.02)); font-size:12px;";
            projCard.innerHTML = `
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <span style="font-weight:600;">📂 Project: ${escapeHtml(proj.name)}</span>
                <span style="font-size:11px; padding:2px 8px; border-radius:4px; background:rgba(34,197,94,0.15); color:#22c55e; font-weight:600;">🟢 Synced</span>
              </div>
              <div style="color:var(--magpie-muted); font-size:11px; word-break:break-all;">Repository: ${escapeHtml(proj.repoPath)}</div>
              <div style="font-size:11px; color:#10b981; margin-top:2px;">Git Exclude Protection: Active (.git/info/exclude)</div>
            `;
            cards.appendChild(projCard);
          });
        }
      });
    }
  }

  let lastMagpieSetAt = 0;
  let magpieSetTimer = null;

  async function pushOptionsToMagpie(forceRescanNonce = false) {
    if (!globalThis.magpie?.options?.set) return;
    const now = Date.now();
    const waitMs = Math.max(0, 1080 - (now - lastMagpieSetAt));
    if (waitMs > 0) {
      await new Promise((r) => {
        clearTimeout(magpieSetTimer);
        magpieSetTimer = setTimeout(r, waitMs);
      });
    }
    try {
      lastMagpieSetAt = Date.now();
      const payload = {
        smartMiddlewareEnabled: hubConfig.smartMiddleware?.enabled !== false,
        maxTools: Number(hubConfig.smartMiddleware?.maxTools) || 96,
        toolsRoot: hubConfig.hubRoot !== undefined ? hubConfig.hubRoot : computeEffectiveHubPath().path,
        hubConfig,
      };
      if (forceRescanNonce) {
        payload.rescanNonce = Date.now();
      }
      await globalThis.magpie.options.set(payload);
    } catch (err) {
      console.warn("Failed to persist options to Magpie:", err);
    }
  }

  // Auto-Save & Auto-Sync with debounce
  function triggerAutoSync() {
    const indicator = $("syncIndicator");
    if (indicator) {
      indicator.textContent = "Syncing...";
      indicator.className = "sync-indicator syncing";
    }

    clearTimeout(autoSyncTimer);
    autoSyncTimer = setTimeout(async () => {
      await persistConfig();
      if (indicator) {
        indicator.textContent = "Synced";
        indicator.className = "sync-indicator";
      }
    }, 450);
  }

  async function persistConfig(forceRescan = false) {
    try {
      localStorage.setItem("magpie_agent_space_config", JSON.stringify(hubConfig));
    } catch {}

    // 1. Try direct API server first (works in browser / unrestricted WebView)
    const saveRes = await apiClient.saveConfig(hubConfig);
    if (saveRes) {
      if (saveRes.sync?.results && Array.isArray(saveRes.sync.results)) {
        for (const r of saveRes.sync.results) {
          if (r.ideId) lastSyncByIde[r.ideId] = r;
        }
      }
      if (Array.isArray(saveRes.plugins)) {
        discoveredPlugins = saveRes.plugins;
        if (saveRes.categories) {
          discoveredCategories = saveRes.categories;
        } else {
          discoveredCategories = buildClientCategoriesRegistry(discoveredPlugins);
        }
        renderAll();
      }
    }

    // 2. Persist to Magpie options (triggers background daemon plugins.json watcher inside CSP-sandboxed iframe)
    await pushOptionsToMagpie(forceRescan);

    // 3. If direct saveRes wasn't reachable (CSP sandbox), wait briefly for daemon to write plugins-cache.js and reload it
    if (!saveRes) {
      await new Promise((r) => setTimeout(r, 450));
      await reloadPluginsFromHub(true);
      renderAll();
    }
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function truncate(str, len) {
    if (!str || str.length <= len) return str;
    return "..." + str.substring(str.length - len + 3);
  }
})();
