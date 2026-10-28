// D:\Software\Magpie\agent-space-manager\page\app.js
// Universal Agent Space Manager with Draggable Reordering, Project Forking, and Dropzones

(async () => {
  const $ = (id) => document.getElementById(id);

  // Default configuration state
  const DEFAULTS = {
    hubRoot: "",
    smartMiddleware: { enabled: true, maxTools: 96 },
    ides: [
      {
        id: "antigravity",
        name: "Antigravity (Google Gemini)",
        exePath: "",
        configPath: "",
        enabled: true,
        plugins: {},
      },
    ],
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

  const apiClient = {
    async getPlugins(path) {
      const targetPath = (path || "").trim();
      const norm = targetPath.toLowerCase().replace(/\\/g, "/");

      // 1. Magpie host IPC bridge (runs directly in Magpie WebView2 without local network ports)
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
      } catch (err) {
        console.warn("magpie IPC getPlugins error:", err);
      }

      // 2. Local API server dynamically with cache-busting timestamp (live filesystem scan)
      try {
        const res = await fetch(`${API_BASE}/api/plugins?path=${encodeURIComponent(targetPath)}&t=${Date.now()}`, { signal: AbortSignal.timeout(5000) });
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
      } catch (err) {
        console.warn("apiClient.getPlugins API fetch error:", err);
      }

      // 3. Synchronous in-memory / script-injected cache (__PLUGINS_CACHE__) strictly if path matches!
      if (globalThis.__PLUGINS_CACHE__ && Array.isArray(globalThis.__PLUGINS_CACHE__.plugins)) {
        const cachePathNorm = (globalThis.__PLUGINS_CACHE__.path || "").trim().toLowerCase().replace(/\\/g, "/");
        if (cachePathNorm === norm) {
          const cached = globalThis.__PLUGINS_CACHE__.plugins;
          cached.forEach(ensurePluginFiles);
          if (globalThis.__PLUGINS_CACHE__.categories) {
            discoveredCategories = globalThis.__PLUGINS_CACHE__.categories;
          }
          return cached;
        }
      }

      // 4. Same-origin static cache file strictly if path matches!
      try {
        const cRes = await fetch(`./plugins-cache.json?t=${Date.now()}`, { signal: AbortSignal.timeout(1500) });
        if (cRes.ok) {
          const cData = await cRes.json();
          const jsonPathNorm = (cData?.path || "").trim().toLowerCase().replace(/\\/g, "/");
          if (jsonPathNorm === norm && Array.isArray(cData.plugins)) {
            cData.plugins.forEach(ensurePluginFiles);
            if (cData.categories) {
              discoveredCategories = cData.categories;
            }
            return cData.plugins;
          }
        }
      } catch (err) {}

      // 5. LocalStorage cached plugins strictly for this exact path
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
  };

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
    if (local && (!hubConfig.ides || hubConfig.ides.length === 0)) {
      const parsed = JSON.parse(local);
      if (parsed?.ides) hubConfig = parsed;
    }
  } catch {}

  // 4. Query live plugins from active storage path
  await reloadPluginsFromHub();

  // 5. Render initial view and setup listeners
  renderAll();
  setupEventListeners();

  async function reloadPluginsFromHub() {
    const effective = computeEffectiveHubPath();
    const targetPath = effective.path;
    discoveredCategories = { plugins: [], mcps: [], hooks: [], skills: [], agents: [], rules: [] };
    const plugins = await apiClient.getPlugins(targetPath);
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
    // If user provided a custom path, use it
    if (hubConfig.hubRoot && hubConfig.hubRoot.trim() !== "") {
      return { path: hubConfig.hubRoot.trim(), isAuto: false };
    }
    // If blank, auto-point to 1st connected IDE's config link directory
    const firstIdePath = getFirstIdeConfigPath();
    if (firstIdePath) {
      return { path: firstIdePath, isAuto: true };
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
      $("hubPathInput").placeholder = `Auto (1st IDE): ${effectiveHub.path}`;
    }
    if ($("hubPathBadge")) {
      if (hubConfig.hubRoot && hubConfig.hubRoot.trim() !== "") {
        if (discoveredPlugins.length === 0) {
          $("hubPathBadge").textContent = "Invalid / 0 Components";
          $("hubPathBadge").className = "hub-path-badge disabled";
        } else {
          $("hubPathBadge").textContent = "Manual Path";
          $("hubPathBadge").className = "hub-path-badge";
        }
      } else {
        $("hubPathBadge").textContent = `1st IDE Linked (${hubConfig.ides[0]?.name || "None"})`;
        $("hubPathBadge").className = "hub-path-badge auto";
      }
    }
    if ($("hubPathHint")) {
      if (hubConfig.hubRoot && hubConfig.hubRoot.trim() !== "") {
        $("hubPathHint").textContent = discoveredPlugins.length === 0
          ? `⚠️ Directory not found or contains 0 components: ${effectiveHub.path}`
          : `Active components storage: ${effectiveHub.path}`;
      } else {
        $("hubPathHint").textContent = `Path is blank or reset. Automatically pointing to 1st connected IDE: ${effectiveHub.path}`;
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

      item.innerHTML = `
        <div style="display:flex; align-items:center; flex:1; min-width:0;">
          <span class="drag-handle" title="Drag to reorder (1st is default storage)">⋮⋮</span>
          <div style="flex:1; min-width:0;">
            <div class="target-title">
              <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#22c55e;"></span>
              ${escapeHtml(ide.name)}
              ${index === 0 ? '<span style="font-size:10px;color:#16a34a;margin-left:4px;">(1st IDE)</span>' : ''}
            </div>
            <div class="target-path">${escapeHtml(truncate(ide.configPath, 42))}</div>
          </div>
        </div>
        <div class="target-item-actions">
          <button type="button" class="btn-danger-text delete-ide-btn" data-id="${escapeHtml(ide.id)}" title="Remove this IDE">Remove</button>
        </div>
      `;

      item.addEventListener("click", (e) => {
        if (e.target.closest(".delete-ide-btn")) return;
        currentSelection = { type: "ide", id: ide.id };
        renderAll();
      });

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

      // Direct, reliable removal: no blocking confirm dialogs
      const removeBtn = item.querySelector(".delete-ide-btn");
      if (removeBtn) {
        removeBtn.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();

          const targetId = ide.id;
          try {
            if (window.magpie?.api?.agentSpaceManager?.removeIde) {
              await window.magpie.api.agentSpaceManager.removeIde(targetId);
            } else if (window.magpie?.api?.smartMiddleware?.removeIde) {
              await window.magpie.api.smartMiddleware.removeIde(targetId);
            }
          } catch (err) {
            console.warn("Backend removeIde call skipped:", err);
          }

          hubConfig.ides = hubConfig.ides.filter((i) => i.id !== targetId);
          hubConfig.projects = hubConfig.projects.filter((p) => p.ideId !== targetId);

          if (currentSelection.id === targetId) {
            currentSelection = { type: "ide", id: hubConfig.ides[0]?.id || "" };
          }

          triggerAutoSync();
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
          <button type="button" class="btn-action-text copy-proj-btn" title="Copy info and assign to another IDE">Clone / Fork</button>
          <button type="button" class="btn-danger-text delete-proj-btn" data-id="${escapeHtml(proj.id)}" title="Remove project override">Remove</button>
        </div>
      `;

      item.addEventListener("click", (e) => {
        if (e.target.closest(".delete-proj-btn") || e.target.closest(".copy-proj-btn")) return;
        currentSelection = { type: "project", id: proj.id };
        renderAll();
      });

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

      // Remove button
      const removeBtn = item.querySelector(".delete-proj-btn");
      if (removeBtn) {
        removeBtn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();

          const targetId = proj.id;
          hubConfig.projects = hubConfig.projects.filter((p) => p.id !== targetId);
          if (currentSelection.type === "project" && currentSelection.id === targetId) {
            currentSelection = { type: "ide", id: hubConfig.ides[0]?.id || "" };
          }
          triggerAutoSync();
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
            <span>${isFilesExpanded ? "▲ Hide Components" : "📁 View Components & Files"}</span> (${filesCount})
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
  async function detectDefaultConfigPath(name, exePath) {
    try {
      const detected = await apiClient.detectConfigPath(name, exePath);
      if (detected) return detected;
    } catch {}

    const combined = `${name || ""} ${exePath || ""}`.toLowerCase();
    
    let userHome = "~";
    if (exePath && (exePath.includes(":\\Users\\") || exePath.includes(":\\users\\"))) {
      const match = exePath.match(/^[a-zA-Z]:\\Users\\[^\\]+/i);
      if (match) userHome = match[0];
    } else if (exePath && exePath.startsWith("/Users/")) {
      const match = exePath.match(/^\/Users\/[^\/]+/);
      if (match) userHome = match[0];
    } else if (exePath && exePath.startsWith("/home/")) {
      const match = exePath.match(/^\/home\/[^\/]+/);
      if (match) userHome = match[0];
    }

    if (combined.includes("opencode")) {
      return `${userHome}\\.config\\opencode\\plugins`;
    }
    if (combined.includes("antigravity") || combined.includes("gemini")) {
      return `${userHome}\\.gemini\\config\\plugins`;
    }
    if (combined.includes("cursor")) {
      return `${userHome}\\.cursor\\skills`;
    }
    if (combined.includes("windsurf")) {
      return `${userHome}\\.windsurf\\skills`;
    }
    if (combined.includes("claude")) {
      return `${userHome}\\.claude\\skills`;
    }
    if (combined.includes("cline") || combined.includes("roo")) {
      return `${userHome}\\AppData\\Roaming\\Code\\User\\globalStorage\\rooveterinaryinc.roo-cline\\skills`;
    }
    if (combined.includes("vscode") || combined.includes("copilot") || /\bcode\b/.test(combined) || combined.endsWith("code.exe")) {
      return `${userHome}\\.vscode\\skills`;
    }

    const clean = name ? name.toLowerCase().replace(/[^a-z0-9_-]/g, "") : "agent";
    return `${userHome}\\.${clean}\\plugins`;
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

    // Modal triggers
    if ($("openAddIdeModalBtn")) {
      $("openAddIdeModalBtn").addEventListener("click", () => {
        if ($("addIdeModal")) $("addIdeModal").style.display = "flex";
        updateAutoDetectState();
      });
    }
    if ($("closeIdeModal")) $("closeIdeModal").addEventListener("click", () => $("addIdeModal").style.display = "none");
    if ($("cancelIdeBtn")) $("cancelIdeBtn").addEventListener("click", () => $("addIdeModal").style.display = "none");

    const autoDetectToggle = $("autoDetectConfigToggle");
    const ideConfigInput = $("ideConfigInput");
    const ideExeInput = $("ideExeInput");
    const ideNameInput = $("ideNameInput");
    const autoDetectLabel = $("autoDetectLabel");
    const configHint = $("configHint");

    async function updateAutoDetectState() {
      if (!autoDetectToggle || !ideConfigInput) return;
      const isAuto = autoDetectToggle.checked;
      ideConfigInput.readOnly = isAuto;
      if (autoDetectLabel) {
        autoDetectLabel.textContent = isAuto ? "Auto-detect: ON" : "Auto-detect: OFF";
        autoDetectLabel.style.color = isAuto ? "#16a34a" : "var(--magpie-muted)";
      }
      if (configHint) {
        configHint.textContent = isAuto
          ? "Automatically computed from binary/IDE name. Turn off to type custom path."
          : "Manual input active. Enter full path where plugins/skills should be linked.";
      }
      if (isAuto) {
        ideConfigInput.value = await detectDefaultConfigPath(ideNameInput?.value, ideExeInput?.value);
      }
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
          if (ideConfigInput) ideConfigInput.value = result.configPath;
        } else {
          // Client-side smart knowledge for known agents
          const rawBase = raw.split(/[/\\]/).pop();
          const baseName = rawBase.toLowerCase();
          const userProf = "C:\\Users\\teren";
          let guessedPath = "";
          let guessedName = inferClientName(rawBase);

          if (baseName.includes("opencode")) {
            guessedPath = `${userProf}\\AppData\\Local\\Programs\\ai.opencode.desktop\\OpenCode.exe`;
            guessedName = "OpenCode";
          } else if (baseName === "code" || baseName.includes("vscode")) {
            guessedPath = `${userProf}\\AppData\\Local\\Programs\\Microsoft VS Code\\Code.exe`;
            guessedName = "VS Code";
          } else if (baseName.includes("cursor")) {
            guessedPath = `${userProf}\\AppData\\Local\\Programs\\cursor\\Cursor.exe`;
            guessedName = "Cursor";
          } else if (baseName.includes("windsurf")) {
            guessedPath = `${userProf}\\AppData\\Local\\Programs\\Windsurf\\Windsurf.exe`;
            guessedName = "Windsurf";
          } else if (baseName.includes("agy") || baseName.includes("antigravity")) {
            guessedPath = `${userProf}\\.gemini\\bin\\agy.cmd`;
            guessedName = "Antigravity";
          }

          if (ideExeInput) ideExeInput.value = guessedPath || raw;
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
          if (ideNameInput && (!ideNameInput.value || ideNameInput.value === "Agent")) {
            ideNameInput.value = res.name;
          }
          if (autoDetectToggle?.checked && ideConfigInput) {
            ideConfigInput.value = res.configPath;
          }
        } else {
          const baseName = file.name.toLowerCase();
          if (baseName.includes("opencode")) {
            if (ideExeInput) ideExeInput.value = "C:\\Users\\teren\\AppData\\Local\\Programs\\ai.opencode.desktop\\OpenCode.exe";
            if (ideNameInput) ideNameInput.value = "OpenCode";
            if (ideConfigInput) ideConfigInput.value = "C:\\Users\\teren\\.config\\opencode\\plugins";
          } else {
            if (ideExeInput) ideExeInput.value = rawPath;
            if (ideNameInput) ideNameInput.value = inferClientName(file.name);
          }
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
        if ($("projectModalTitle")) $("projectModalTitle").textContent = "Add Project Repository";
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

    // Add IDE save
    if ($("saveIdeBtn")) {
      $("saveIdeBtn").addEventListener("click", async () => {
        const name = $("ideNameInput")?.value?.trim();
        const exePath = $("ideExeInput")?.value?.trim() || "";
        let configPath = $("ideConfigInput")?.value?.trim();

        if (autoDetectToggle?.checked || !configPath) {
          configPath = await detectDefaultConfigPath(name, exePath);
        }

        if (!name || !configPath) {
          alert("Please provide an IDE name.");
          return;
        }

        const id = name.toLowerCase().replace(/[^a-z0-9]/g, "-");
        hubConfig.ides.push({ id, name, exePath, configPath, enabled: true, plugins: {} });
        if ($("addIdeModal")) $("addIdeModal").style.display = "none";
        triggerAutoSync();
        renderAll();
      });
    }

    // Add Project save
    if ($("saveProjectBtn")) {
      $("saveProjectBtn").addEventListener("click", async () => {
        const name = $("projectNameInput")?.value?.trim();
        const ideId = $("projectIdeSelect")?.value;
        const repoPath = $("projectPathInput")?.value?.trim();

        if (!name || !repoPath) {
          alert("Please provide project name and repository path.");
          return;
        }

        const id = "proj-" + Date.now();
        hubConfig.projects.push({ id, name, ideId, repoPath, plugins: {} });
        if ($("addProjectModal")) $("addProjectModal").style.display = "none";
        triggerAutoSync();
        renderAll();
      });
    }

    // Rescan button
    if ($("rescanBtn")) {
      $("rescanBtn").addEventListener("click", async () => {
        $("rescanBtn").textContent = "Scanning...";
        await reloadPluginsFromHub();
        renderAll();
        $("rescanBtn").textContent = "Rescan Hub";
      });
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
    }, 400);
  }

  async function persistConfig() {
    try {
      localStorage.setItem("magpie_agent_space_config", JSON.stringify(hubConfig));
    } catch {}

    // Call local API server to save config, sync junctions, and get dynamic plugins
    const saveRes = await apiClient.saveConfig(hubConfig);
    if (saveRes && Array.isArray(saveRes.plugins)) {
      discoveredPlugins = saveRes.plugins;
      if (saveRes.categories) {
        discoveredCategories = saveRes.categories;
      } else {
        discoveredCategories = buildClientCategoriesRegistry(discoveredPlugins);
      }
      renderAll();
    }

    try {
      if (globalThis.magpie?.options?.set) {
        await globalThis.magpie.options.set({
          smartMiddlewareEnabled: hubConfig.smartMiddleware?.enabled !== false,
          maxTools: Number(hubConfig.smartMiddleware?.maxTools) || 96,
          toolsRoot: hubConfig.hubRoot || computeEffectiveHubPath().path,
          hubConfig,
        });
      }
    } catch (err) {
      console.warn("Failed to persist options to Magpie:", err);
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
