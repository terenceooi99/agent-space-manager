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

  // Non-blocking toast notifications (Desktop WebView2 Dialog Safety Invariant)
  function showToast(message, type = "info", duration = 4000) {
    try {
      let container = $("toastContainer");
      if (!container) {
        container = document.createElement("div");
        container.id = "toastContainer";
        container.style.cssText = "position: fixed; bottom: 20px; right: 20px; z-index: 99999; display: flex; flex-direction: column; gap: 8px; pointer-events: none;";
        document.body.appendChild(container);
      }
      const toast = document.createElement("div");
      toast.className = `toast toast-${type}`;
      const bg = type === "error" ? "#dc2626" : type === "success" ? "#16a34a" : "#2563eb";
      toast.style.cssText = `background: ${bg}; color: #ffffff; padding: 10px 16px; border-radius: 6px; font-size: 13px; font-weight: 500; box-shadow: 0 4px 12px rgba(0,0,0,0.25); pointer-events: auto; transition: opacity 0.3s ease, transform 0.3s ease; opacity: 0; transform: translateY(8px); display: flex; align-items: center; gap: 8px;`;
      const icon = type === "error" ? "⚠️" : type === "success" ? "✓" : "ℹ️";
      toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
      container.appendChild(toast);

      requestAnimationFrame(() => {
        toast.style.opacity = "1";
        toast.style.transform = "translateY(0)";
      });

      setTimeout(() => {
        toast.style.opacity = "0";
        toast.style.transform = "translateY(8px)";
        setTimeout(() => {
          toast.remove();
          if (container.children.length === 0) container.remove();
        }, 300);
      }, duration);
    } catch (err) {
      console.warn("Toast error:", err);
    }
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
      const rawTarget = (path || "").trim();
      const targetPath = rawTarget.replace(/^["']+|["']+$/g, "").trim();
      const norm = normalizePathForCompare(targetPath);

      // Helper to check if cache matches target path
      const isCacheMatch = (cPath, cPlugins) => {
        if (!Array.isArray(cPlugins) || cPlugins.length === 0) return false;
        const cachePathNorm = normalizePathForCompare(cPath);
        if (cachePathNorm && cachePathNorm === norm) return true;
        // Universal baseline cache: matches when targetPath is empty, default hub, or cached plugins reside inside targetPath
        const eff = computeEffectiveHubPath();
        const effNorm = normalizePathForCompare(eff.path);
        if (!targetPath || norm === effNorm || norm === normalizePathForCompare("D:/Software/AI Agent Space")) {
          return true;
        }
        const firstPluginPath = cPlugins[0]?.path;
        if (firstPluginPath) {
          const firstNorm = normalizePathForCompare(firstPluginPath);
          if (firstNorm.startsWith(norm)) return true;
        }
        return false;
      };

      // 1. Magpie host IPC bridge (if available)
      try {
        const magpieApi = getMagpieApi();
        const scanFn = typeof magpieApi?.scanPlugins === "function"
          ? magpieApi.scanPlugins
          : (typeof magpieApi?.getPlugins === "function" ? magpieApi.getPlugins : null);
        if (scanFn) {
          const mPlugins = await scanFn(targetPath);
          if (Array.isArray(mPlugins) && mPlugins.length > 0) {
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
        const res = await fetch(`${API_BASE}/api/plugins?path=${encodeURIComponent(targetPath)}&t=${Date.now()}`, { signal: AbortSignal.timeout(10000) });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.plugins) && data.plugins.length > 0) {
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

      // 4. Synchronous in-memory / script-injected cache (__PLUGINS_CACHE__)
      if (globalThis.__PLUGINS_CACHE__ && isCacheMatch(globalThis.__PLUGINS_CACHE__.path, globalThis.__PLUGINS_CACHE__.plugins)) {
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

      // 5. Same-origin static cache file
      try {
        const cRes = await fetch(`./plugins-cache.json?t=${Date.now()}`, { signal: AbortSignal.timeout(2000) });
        if (cRes.ok) {
          const cData = await cRes.json();
          if (isCacheMatch(cData?.path, cData?.plugins)) {
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
          if (Array.isArray(parsed) && parsed.length > 0) {
            parsed.forEach(ensurePluginFiles);
            return parsed;
          }
        }
      } catch {}

      return [];
    },

    async saveConfig(config, options = {}) {
      try {
        const magpieApi = getMagpieApi();
        if (typeof magpieApi?.saveConfig === "function") {
          const res = await magpieApi.saveConfig(config, options);
          if (res) return res;
        }
      } catch {}
      try {
        const payload = { config, ...options };
        const res = await fetch(`${API_BASE}/api/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) return await res.json();
      } catch (err) {
        console.warn("apiClient.saveConfig error:", err);
      }
      return null;
    },

    async removeIde(ideId, killProcesses = false) {
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

    async checkModifications(customHubRoot) {
      try {
        const magpieApi = getMagpieApi();
        if (typeof magpieApi?.checkModifications === "function") {
          const res = await magpieApi.checkModifications(customHubRoot);
          if (res) return res;
        }
      } catch {}
      try {
        const res = await fetch(`${API_BASE}/api/check-modifications?path=${encodeURIComponent(customHubRoot || "")}&t=${Date.now()}`, { signal: AbortSignal.timeout(5000) });
        if (res.ok) return await res.json();
      } catch {}
      return null;
    },

    async startupSync(customConfig) {
      try {
        const magpieApi = getMagpieApi();
        if (typeof magpieApi?.startupSync === "function") {
          const res = await magpieApi.startupSync(customConfig);
          if (res) return res;
        }
      } catch {}
      try {
        const res = await fetch(`${API_BASE}/api/startup-sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(customConfig || {}),
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) return await res.json();
      } catch {}
      return null;
    },

    async recheckStatus(customConfig) {
      try {
        const magpieApi = getMagpieApi();
        if (typeof magpieApi?.recheckStatus === "function") {
          const res = await magpieApi.recheckStatus(customConfig);
          if (res) return res;
        }
      } catch {}
      try {
        const res = await fetch(`${API_BASE}/api/recheck-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(customConfig || {}),
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) return await res.json();
      } catch {}
      return null;
    },

    async connectTarget(target, options = {}) {
      try {
        const magpieApi = getMagpieApi();
        if (typeof magpieApi?.connectAgent === "function") {
          const res = await magpieApi.connectAgent(target, options);
          if (res) return res;
        }
      } catch {}
      try {
        const res = await fetch(`${API_BASE}/api/connect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(target || {}),
          signal: AbortSignal.timeout(15000),
        });
        if (res.ok) return await res.json();
      } catch (err) {
        console.warn("apiClient.connectTarget error:", err);
      }
      return null;
    },

    async checkCentralUpdates(customHubRoot, force = false) {
      try {
        const magpieApi = getMagpieApi();
        if (typeof magpieApi?.checkCentralizedUpdates === "function") {
          const res = await magpieApi.checkCentralizedUpdates(customHubRoot, { force });
          if (res) return res;
        }
      } catch {}
      try {
        const res = await fetch(`${API_BASE}/api/central-update-check?path=${encodeURIComponent(customHubRoot || "")}&force=${force ? "true" : "false"}&t=${Date.now()}`, { signal: AbortSignal.timeout(5000) });
        if (res.ok) return await res.json();
      } catch {}
      return null;
    },

    async getCentralUpdateStatus(customHubRoot) {
      try {
        const magpieApi = getMagpieApi();
        if (typeof magpieApi?.getCentralizedUpdateStatus === "function") {
          const res = await magpieApi.getCentralizedUpdateStatus(customHubRoot);
          if (res) return res;
        }
      } catch {}
      try {
        const res = await fetch(`${API_BASE}/api/central-update-status?path=${encodeURIComponent(customHubRoot || "")}&t=${Date.now()}`, { signal: AbortSignal.timeout(3000) });
        if (res.ok) return await res.json();
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
  let verifiedStatusByIde = {};
  let verifiedStatusByProject = {};

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

  const statusCheckingUI = {
    show(stepText = "Auditing connected agents & enabled plugins...", pct = 25) {
      const modal = $("statusCheckingModal");
      if (!modal) return;
      modal.style.display = "flex";
      if ($("statusCheckingTitle")) $("statusCheckingTitle").textContent = "Checking Component Status...";
      if ($("statusCheckingStep")) $("statusCheckingStep").textContent = stepText;
      if ($("statusCheckingPct")) $("statusCheckingPct").textContent = `${pct}%`;
      if ($("statusCheckingProgressBar")) $("statusCheckingProgressBar").style.width = `${pct}%`;
      if ($("statusCheckingSummary")) $("statusCheckingSummary").style.display = "none";
      if ($("btnDoneStatusCheck")) $("btnDoneStatusCheck").style.display = "none";
      if ($("btnBackgroundStatusCheck")) $("btnBackgroundStatusCheck").style.display = "inline-block";
      if ($("statusCheckingSpinner")) $("statusCheckingSpinner").style.display = "inline-block";
      if ($("statusCheckingFooterNote")) $("statusCheckingFooterNote").textContent = "Checking status dots in background...";

      this.renderAgentItems();
    },

    update(stepText, pct) {
      const modal = $("statusCheckingModal");
      if (!modal || modal.style.display !== "flex") return;
      if (stepText && $("statusCheckingStep")) $("statusCheckingStep").textContent = stepText;
      if (pct !== undefined) {
        if ($("statusCheckingPct")) $("statusCheckingPct").textContent = `${pct}%`;
        if ($("statusCheckingProgressBar")) $("statusCheckingProgressBar").style.width = `${pct}%`;
      }
      this.renderAgentItems();
    },

    finish(summaryText = "Status Check Complete! Verified all enabled plugins.") {
      const modal = $("statusCheckingModal");
      if (!modal || modal.style.display !== "flex") return;
      if ($("statusCheckingTitle")) $("statusCheckingTitle").textContent = "Component Status Verified";
      if ($("statusCheckingStep")) $("statusCheckingStep").textContent = "✓ Status verification complete";
      if ($("statusCheckingPct")) $("statusCheckingPct").textContent = "100%";
      if ($("statusCheckingProgressBar")) $("statusCheckingProgressBar").style.width = "100%";
      if ($("statusCheckingSpinner")) $("statusCheckingSpinner").style.display = "none";
      if ($("statusCheckingSummary")) {
        $("statusCheckingSummary").style.display = "block";
        $("statusCheckingSummary").innerHTML = `<strong>Status Check Complete!</strong> ${escapeHtml(summaryText)}`;
      }
      if ($("statusCheckingFooterNote")) $("statusCheckingFooterNote").textContent = "All component status dots up to date.";
      if ($("btnDoneStatusCheck")) $("btnDoneStatusCheck").style.display = "inline-block";
      if ($("btnBackgroundStatusCheck")) $("btnBackgroundStatusCheck").style.display = "none";

      this.renderAgentItems();

      setTimeout(() => {
        if (modal.style.display === "flex") {
          modal.style.display = "none";
        }
      }, 1200);
    },

    hide() {
      const modal = $("statusCheckingModal");
      if (modal) modal.style.display = "none";
    },

    renderAgentItems() {
      const container = $("statusCheckingAgentList");
      if (!container) return;
      const agents = (hubConfig.ides || []).filter((i) => i && i.enabled !== false);
      if (agents.length === 0) {
        container.innerHTML = `<div style="color:var(--magpie-muted); padding:4px;">No connected agents to verify.</div>`;
        return;
      }

      container.innerHTML = agents.map((ide) => {
        const enabledCount = Object.values(ide.plugins || {}).filter((v) => v === true).length;
        const verifiedMap = verifiedStatusByIde[ide.id] || {};
        const isVerified = Object.keys(verifiedMap).length > 0;
        const statusBadge = isVerified
          ? `<span style="font-size:10.5px; padding:2px 8px; border-radius:4px; background:rgba(34,197,94,0.15); color:#22c55e; font-weight:600;">🟢 Verified</span>`
          : `<span style="font-size:10.5px; padding:2px 8px; border-radius:4px; background:rgba(96,165,250,0.15); color:#60a5fa; font-weight:600;">Checking...</span>`;
        return `
          <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 10px; border-radius:6px; background:var(--magpie-surface-alt, rgba(255,255,255,0.02)); border:1px solid var(--magpie-border, #333);">
            <div>
              <span style="font-weight:600;">${escapeHtml(ide.name || ide.id)}</span>
              <span style="font-size:11px; color:var(--magpie-muted); margin-left:6px;">(${enabledCount} enabled plugins)</span>
            </div>
            ${statusBadge}
          </div>
        `;
      }).join("");
    }
  };

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

  // 4b. On startup: check for modification difference in Components Storage Path and recheck status dots for each enabled plugin in each connected agent!
  let startupSyncResult = null;
  statusCheckingUI.show("Auditing connected agents & enabled plugin status dots...", 25);
  try {
    startupSyncResult = await apiClient.startupSync(hubConfig);
    statusCheckingUI.update("Inspecting component files & directories on disk...", 75);
    if (startupSyncResult?.statusByIde) {
      verifiedStatusByIde = startupSyncResult.statusByIde;
    }
    if (startupSyncResult?.statusByProject) {
      verifiedStatusByProject = startupSyncResult.statusByProject;
    }
    if (startupSyncResult?.sync?.results && Array.isArray(startupSyncResult.sync.results)) {
      for (const r of startupSyncResult.sync.results) {
        if (r.ideId) lastSyncByIde[r.ideId] = r;
      }
    }
    if (startupSyncResult?.hasChanges && startupSyncResult?.autoReconnected) {
      await reloadPluginsFromHub(true);
    }
    statusCheckingUI.finish(
      startupSyncResult?.autoReconnected
        ? "Auto-reconnected and verified all enabled plugin status dots across connected agents."
        : "Verified all enabled plugin status dots across connected agents."
    );
  } catch (err) {
    console.warn("Startup modification check/reconnect failed:", err);
    statusCheckingUI.hide();
  }

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
  renderStartupReconnectStatus(startupSyncResult);

  // 6. Post-Startup Status Dot Rechecker:
  // Rechecks the workability status dot for each enabled plugin across all connected agents after startup,
  // ensuring that after Magpie is closed or task-killed, live status dots accurately reflect on-disk state.
  function updateStatusDotsInDom() {
    const tableBody = $("pluginTableBody");
    if (!tableBody) return;
    const rows = tableBody.querySelectorAll("tr");
    rows.forEach((row) => {
      const toggle = row.querySelector(".plugin-toggle");
      if (!toggle) return;
      const pluginId = toggle.dataset.plugin;
      const plugin = discoveredPlugins.find((p) => p.id === pluginId);
      if (!plugin) return;
      const workability = evaluateComponentWorkability(plugin);
      const dot = row.querySelector(".component-status-dot");
      if (dot) {
        dot.className = `component-status-dot dot-${workability.color}`;
        dot.title = workability.tooltip;
        dot.setAttribute("aria-label", workability.summary);
      }
    });
  }

  let isRecheckingStatusDots = false;
  async function recheckAllStatusDots(updateDom = true, showProgress = false) {
    if (isRecheckingStatusDots) return;
    isRecheckingStatusDots = true;
    if (showProgress) {
      statusCheckingUI.show("Auditing connected agents & enabled plugin status dots...", 35);
    }
    try {
      const res = await apiClient.recheckStatus(hubConfig);
      if (res?.statusByIde) {
        verifiedStatusByIde = res.statusByIde;
      }
      if (res?.statusByProject) {
        verifiedStatusByProject = res.statusByProject;
      }
      if (updateDom) {
        updateStatusDotsInDom();
      }
      if (showProgress) {
        statusCheckingUI.finish(`Verified ${res?.totalChecked || 0} component status dots across connected agents.`);
      }
    } catch {
      if (showProgress) statusCheckingUI.hide();
    } finally {
      isRecheckingStatusDots = false;
    }
  }

  // Trigger post-startup status rechecks (runs during and after startup initialization)
  setTimeout(() => recheckAllStatusDots(true), 150);
  setTimeout(() => recheckAllStatusDots(true), 1200);

  // Recheck status dots when Magpie window gains focus or visibility (e.g. after Magpie was reopened or un-minimized)
  window.addEventListener("focus", () => recheckAllStatusDots(true));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) recheckAllStatusDots(true);
  });

  // Background status dot watcher (throttled to >= 2000ms conforming to Safety Invariant 7)
  const statusWatcherInterval = setInterval(() => {
    recheckAllStatusDots(true);
  }, 5000);
  if (typeof statusWatcherInterval.unref === "function") {
    statusWatcherInterval.unref();
  }

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
      const cleaned = hubConfig.hubRoot.trim().replace(/^["']+|["']+$/g, "").trim();
      return { path: cleaned, isAuto: false };
    }
    const fallback = (hubConfig.defaultHubRoot || "~/AI-Agent-Space").trim().replace(/^["']+|["']+$/g, "").trim();
    return { path: fallback, isAuto: true };
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
        if (typeof recheckAllStatusDots === "function") {
          recheckAllStatusDots(true);
        }
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
        let confirmTimer = null;
        removeBtn.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();

          const targetId = ide.id;

          // Step 1: Inline confirmation (immune to WebView2/Electron modal dialog suppression)
          if (removeBtn.dataset.confirming !== "true") {
            removeBtn.dataset.confirming = "true";
            removeBtn.textContent = "Click to Confirm";
            removeBtn.style.color = "#ef4444";
            removeBtn.style.fontWeight = "bold";

            if (confirmTimer) clearTimeout(confirmTimer);
            confirmTimer = setTimeout(() => {
              if (removeBtn) {
                delete removeBtn.dataset.confirming;
                removeBtn.textContent = "Remove";
                removeBtn.style.color = "";
                removeBtn.style.fontWeight = "";
              }
            }, 4000);
            return;
          }

          // Step 2: Confirmed removal
          if (confirmTimer) clearTimeout(confirmTimer);
          delete removeBtn.dataset.confirming;
          removeBtn.disabled = true;
          removeBtn.textContent = "Removing...";

          try {
            await apiClient.removeIde(targetId, false);
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
        if (typeof recheckAllStatusDots === "function") {
          recheckAllStatusDots(true);
        }
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
        let confirmProjTimer = null;
        deleteProjBtn.addEventListener("click", async (e) => {
          e.preventDefault();
          e.stopPropagation();

          const targetId = proj.id;

          // Step 1: Inline confirmation (immune to WebView2/Electron modal dialog suppression)
          if (deleteProjBtn.dataset.confirming !== "true") {
            deleteProjBtn.dataset.confirming = "true";
            deleteProjBtn.textContent = "Click to Confirm";
            deleteProjBtn.style.color = "#ef4444";
            deleteProjBtn.style.fontWeight = "bold";

            if (confirmProjTimer) clearTimeout(confirmProjTimer);
            confirmProjTimer = setTimeout(() => {
              if (deleteProjBtn) {
                delete deleteProjBtn.dataset.confirming;
                deleteProjBtn.textContent = "Remove";
                deleteProjBtn.style.color = "";
                deleteProjBtn.style.fontWeight = "";
              }
            }, 4000);
            return;
          }

          // Step 2: Confirmed removal
          if (confirmProjTimer) clearTimeout(confirmProjTimer);
          delete deleteProjBtn.dataset.confirming;
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

  function evaluateComponentAgentWorkability(plugin, ide, options = {}) {
    if (!plugin) {
      return { workable: false, color: "red", status: "failed", features: {}, summary: "No component", tooltip: "🔴 Error: No component provided" };
    }
    if (!ide) {
      return { workable: false, color: "red", status: "failed", features: {}, summary: "No connected agent selected", tooltip: "🔴 Connection failed: No connected agent selected. Click an agent on the left to inspect workability." };
    }
    if (ide.enabled === false) {
      return { workable: false, color: "red", status: "disabled", features: {}, summary: `Agent "${ide.name || ide.id}" is disabled`, tooltip: `🔴 Connection failed: Agent "${ide.name || ide.id}" is disabled in settings` };
    }
    const configPath = ide.configPath || (ide.componentPaths && (ide.componentPaths.skills || ide.componentPaths.bundle));
    if (!configPath || String(configPath).trim() === "") {
      return { workable: false, color: "red", status: "failed", features: {}, summary: `Agent "${ide.name || ide.id}" has no configuration path`, tooltip: `🔴 Connection failed: Target link path for "${ide.name || ide.id}" is not configured` };
    }
    const isEnabled = Boolean(ide.plugins && ide.plugins[plugin.id] === true);
    if (!isEnabled) {
      return { workable: false, color: "red", status: "disabled", features: {}, summary: `Disabled for ${ide.name || ide.id}`, tooltip: `🔴 Connection failed / Disabled: Component is toggled OFF for "${ide.name || ide.id}". Turn on the toggle switch to connect.` };
    }
    if (options.lastSync && options.lastSync.success === false) {
      const errMsg = options.lastSync.error || options.lastSync.message || "Sync error";
      return { workable: false, color: "red", status: "failed", features: {}, summary: `Connection failed: ${errMsg}`, tooltip: `🔴 Connection failed to "${ide.name || ide.id}": ${errMsg}` };
    }

    // Identify component types ACTUALLY INSIDE the plugin.
    // Explicitly SKIP any component type that is NOT present in the plugin.
    const rawSkills = Array.isArray(plugin.skills) ? plugin.skills : [];
    const hasSkillsInside = rawSkills.length > 0;

    const rawAgents = Array.isArray(plugin.agents) ? plugin.agents : [];
    const hasAgentsInside = rawAgents.length > 0;

    const rawMcps = Array.isArray(plugin.mcps) ? plugin.mcps : [];
    const hasMcpInside = Boolean(plugin.hasMcp || rawMcps.length > 0);

    const rawRules = Array.isArray(plugin.rules) ? plugin.rules : [];
    const hasRulesInside = rawRules.length > 0;

    const rawHooks = Array.isArray(plugin.hooks) ? plugin.hooks : [];
    const hasHooksInside = Boolean(plugin.hasHooks || rawHooks.length > 0);

    const hasAnyFeature = hasSkillsInside || hasAgentsInside || hasMcpInside || hasRulesInside || hasHooksInside || (plugin.filesCount && plugin.filesCount > 0);
    if (!hasAnyFeature && !plugin.path) {
      return { workable: false, color: "red", status: "failed", features: {}, summary: "Empty component", tooltip: `🔴 Connection failed: No workable components discovered in "${plugin.name || plugin.id}"` };
    }

    // Resolve agent profile capabilities
    const agentType = String(ide.agentType || ide.id || "").toLowerCase();
    const profile = agentProfiles.find((p) => p.id === agentType) || { capabilities: { skills: true, mcp: true, rules: true, agents: true, hooks: true } };
    const isBundle = profile?.mode === "bundle" || agentType === "antigravity";
    const customPaths = ide.componentPaths || {};

    const capabilities = {
      skills: isBundle || customPaths.skills ? true : (profile?.capabilities?.skills ?? true),
      mcp: isBundle || customPaths.mcp ? true : (profile?.capabilities?.mcp ?? true),
      rules: isBundle || customPaths.rules ? true : (profile?.capabilities?.rules ?? true),
      agents: isBundle || customPaths.agents ? true : (profile?.capabilities?.agents ?? true),
      hooks: isBundle || customPaths.hooks ? true : (profile?.capabilities?.hooks ?? true),
    };

    const features = {};
    const actionParts = [];
    const detailedTooltipLines = [];
    let workableCount = 0;
    let presentTypeCount = 0;

    // 1. Skills Check (only if present inside plugin)
    let slashCommands = [];
    if (hasSkillsInside) {
      presentTypeCount++;
      slashCommands = rawSkills.map((s) => (typeof s === "string" ? `/${s}` : `/${s.name}`));
      const isSupported = capabilities.skills === true;
      if (isSupported) {
        workableCount++;
        actionParts.push(`Quick action: ${slashCommands.join(" ")}`);
        detailedTooltipLines.push(`✓ Skills (${slashCommands.length}): ${slashCommands.join(" ")}`);
      } else {
        detailedTooltipLines.push(`✗ Skills (${slashCommands.length}): Skipped (unsupported by ${ide.name || ide.id})`);
      }
      features.skills = {
        present: true,
        count: slashCommands.length,
        workable: isSupported,
        items: slashCommands,
        reason: isSupported ? "Active" : `Unsupported by ${ide.name || ide.id}`,
      };
    }

    // 2. Agents / Subagents Check (only if present inside plugin)
    let mentions = [];
    if (hasAgentsInside) {
      presentTypeCount++;
      mentions = rawAgents.map((a) => {
        const rawName = typeof a === "string" ? a : a.name || "";
        return `@${rawName.replace(/\.md$/i, "")}`;
      });
      const isSupported = capabilities.agents === true;
      if (isSupported) {
        workableCount++;
        actionParts.push(`Quick action: ${mentions.join(" ")}`);
        detailedTooltipLines.push(`✓ Agents (${mentions.length}): ${mentions.join(" ")}`);
      } else {
        detailedTooltipLines.push(`✗ Agents (${mentions.length}): Skipped (unsupported by ${ide.name || ide.id})`);
      }
      features.agents = {
        present: true,
        count: mentions.length,
        workable: isSupported,
        items: mentions,
        reason: isSupported ? "Active" : `Unsupported by ${ide.name || ide.id}`,
      };
    }

    // 3. MCP Servers Check (only if present inside plugin)
    if (hasMcpInside) {
      presentTypeCount++;
      const mcpNames = rawMcps.length > 0 ? rawMcps : [plugin.id || "mcp"];
      const isSupported = capabilities.mcp === true;
      if (isSupported) {
        workableCount++;
        actionParts.push("MCP tools active");
        detailedTooltipLines.push(`✓ MCP (${mcpNames.length}): ${mcpNames.join(", ")} active`);
      } else {
        detailedTooltipLines.push(`✗ MCP (${mcpNames.length}): Skipped (unsupported by ${ide.name || ide.id})`);
      }
      features.mcp = {
        present: true,
        count: mcpNames.length,
        workable: isSupported,
        items: mcpNames,
        reason: isSupported ? "Active" : `Unsupported by ${ide.name || ide.id}`,
      };
    }

    // 4. Rules Check (only if present inside plugin)
    if (hasRulesInside) {
      presentTypeCount++;
      const ruleNames = rawRules.map((r) => (typeof r === "string" ? r : r.name || ""));
      const isSupported = capabilities.rules === true;
      if (isSupported) {
        workableCount++;
        actionParts.push("Rules active");
        detailedTooltipLines.push(`✓ Rules (${ruleNames.length}): ${ruleNames.join(", ")} active`);
      } else {
        detailedTooltipLines.push(`✗ Rules (${ruleNames.length}): Skipped (unsupported by ${ide.name || ide.id})`);
      }
      features.rules = {
        present: true,
        count: ruleNames.length,
        workable: isSupported,
        items: ruleNames,
        reason: isSupported ? "Active" : `Unsupported by ${ide.name || ide.id}`,
      };
    }

    // 5. Hooks Check (only if present inside plugin)
    if (hasHooksInside) {
      presentTypeCount++;
      const hookCount = rawHooks.length > 0 ? rawHooks.length : 1;
      const isSupported = capabilities.hooks === true;
      if (isSupported) {
        workableCount++;
        actionParts.push("Hooks active");
        detailedTooltipLines.push(`✓ Hooks (${hookCount}): Active`);
      } else {
        detailedTooltipLines.push(`✗ Hooks (${hookCount}): Skipped (unsupported by ${ide.name || ide.id})`);
      }
      features.hooks = {
        present: true,
        count: hookCount,
        workable: isSupported,
        items: rawHooks,
        reason: isSupported ? "Active" : `Unsupported by ${ide.name || ide.id}`,
      };
    }

    // If component has types present but NONE of them are supported by this agent
    if (presentTypeCount > 0 && workableCount === 0) {
      return {
        workable: false,
        color: "red",
        status: "unsupported",
        features,
        quickActions: { slashCommands, mentions, hasSlash: false, hasMention: false, hasMcp: false, hasRules: false, hasHooks: false },
        summary: `Incompatible with ${ide.name || ide.id}`,
        tooltip: `🔴 Incompatible with ${ide.name || ide.id}: All component types in "${plugin.name || plugin.id}" are unsupported.`,
        reason: `All component types in "${plugin.name || plugin.id}" are unsupported by ${ide.name || ide.id}`,
      };
    }

    const hasSlash = slashCommands.length > 0 && capabilities.skills === true;
    const hasMention = mentions.length > 0 && capabilities.agents === true;
    const hasMcp = hasMcpInside && capabilities.mcp === true;
    const hasRules = hasRulesInside && capabilities.rules === true;
    const hasHooks = hasHooksInside && capabilities.hooks === true;

    const summary = `Workable in ${ide.name || ide.id}${actionParts.length > 0 ? " · " + actionParts.join(" · ") : ""}`;
    const baseTooltip = `🟢 Workable in ${ide.name || ide.id}: Connected & ready.${actionParts.length > 0 ? " Can be used with " + actionParts.join(" | ") : ""}`;
    const tooltip = detailedTooltipLines.length > 0 ? `${baseTooltip}\n${detailedTooltipLines.join("\n")}` : baseTooltip;

    return {
      workable: true,
      color: "green",
      status: "workable",
      features,
      quickActions: {
        slashCommands,
        mentions,
        hasSlash,
        hasMention,
        hasMcp,
        hasRules,
        hasHooks,
      },
      summary,
      tooltip,
    };
  }

  function evaluateComponentProjectWorkability(plugin, project, parentIde) {
    if (!project || !project.repoPath) {
      return { workable: false, color: "red", status: "failed", features: {}, summary: "Project repository path missing", tooltip: "🔴 Connection failed: Repository path does not exist" };
    }
    const isEnabled = project.plugins && project.plugins[plugin.id] !== undefined
      ? project.plugins[plugin.id] === true
      : Boolean(parentIde?.plugins && parentIde.plugins[plugin.id] === true);
    if (!isEnabled) {
      return { workable: false, color: "red", status: "disabled", features: {}, summary: `Disabled for project "${project.name}"`, tooltip: `🔴 Connection failed / Disabled: Component is toggled OFF for project "${project.name}"` };
    }

    const rawSkills = Array.isArray(plugin.skills) ? plugin.skills : [];
    const hasSkillsInside = rawSkills.length > 0;

    const rawAgents = Array.isArray(plugin.agents) ? plugin.agents : [];
    const hasAgentsInside = rawAgents.length > 0;

    const rawMcps = Array.isArray(plugin.mcps) ? plugin.mcps : [];
    const hasMcpInside = Boolean(plugin.hasMcp || rawMcps.length > 0);

    const rawRules = Array.isArray(plugin.rules) ? plugin.rules : [];
    const hasRulesInside = rawRules.length > 0;

    const rawHooks = Array.isArray(plugin.hooks) ? plugin.hooks : [];
    const hasHooksInside = Boolean(plugin.hasHooks || rawHooks.length > 0);

    const hasAnyFeature = hasSkillsInside || hasAgentsInside || hasMcpInside || hasRulesInside || hasHooksInside || (plugin.filesCount && plugin.filesCount > 0);
    if (!hasAnyFeature && !plugin.path) {
      return { workable: false, color: "red", status: "failed", features: {}, summary: "Empty component", tooltip: `🔴 Connection failed: No workable components discovered in "${plugin.name || plugin.id}"` };
    }

    const agentType = String(parentIde?.agentType || parentIde?.id || "").toLowerCase();
    const profile = agentProfiles.find((p) => p.id === agentType) || { capabilities: { skills: true, mcp: true, rules: true, agents: true, hooks: true } };
    const capabilities = {
      skills: true,
      mcp: true,
      rules: true,
      agents: profile?.capabilities?.agents ?? true,
      hooks: profile?.capabilities?.hooks ?? false,
    };

    const features = {};
    const actionParts = [];
    const detailedTooltipLines = [];

    // 1. Skills
    if (hasSkillsInside) {
      const slashCommands = rawSkills.map((s) => (typeof s === "string" ? `/${s}` : `/${s.name}`));
      actionParts.push(`Quick action: ${slashCommands.join(" ")}`);
      detailedTooltipLines.push(`✓ Skills (${slashCommands.length}): ${slashCommands.join(" ")}`);
      features.skills = { present: true, count: slashCommands.length, workable: true, items: slashCommands, reason: "Active" };
    }

    // 2. Agents
    if (hasAgentsInside) {
      const mentions = rawAgents.map((a) => {
        const rawName = typeof a === "string" ? a : a.name || "";
        return `@${rawName.replace(/\.md$/i, "")}`;
      });
      const isSupported = capabilities.agents === true;
      if (isSupported) {
        actionParts.push(`Quick action: ${mentions.join(" ")}`);
        detailedTooltipLines.push(`✓ Agents (${mentions.length}): ${mentions.join(" ")}`);
      } else {
        detailedTooltipLines.push(`✗ Agents (${mentions.length}): Skipped (unsupported in workspace repository)`);
      }
      features.agents = { present: true, count: mentions.length, workable: isSupported, items: mentions, reason: isSupported ? "Active" : "Unsupported" };
    }

    // 3. MCP
    if (hasMcpInside) {
      const mcpNames = rawMcps.length > 0 ? rawMcps : [plugin.id || "mcp"];
      actionParts.push("MCP tools active");
      detailedTooltipLines.push(`✓ MCP (${mcpNames.length}): ${mcpNames.join(", ")} active`);
      features.mcp = { present: true, count: mcpNames.length, workable: true, items: mcpNames, reason: "Active" };
    }

    // 4. Rules
    if (hasRulesInside) {
      const ruleNames = rawRules.map((r) => (typeof r === "string" ? r : r.name || ""));
      actionParts.push("Rules active");
      detailedTooltipLines.push(`✓ Rules (${ruleNames.length}): ${ruleNames.join(", ")} active`);
      features.rules = { present: true, count: ruleNames.length, workable: true, items: ruleNames, reason: "Active" };
    }

    // 5. Hooks
    if (hasHooksInside) {
      const hookCount = rawHooks.length > 0 ? rawHooks.length : 1;
      const isSupported = capabilities.hooks === true;
      if (isSupported) {
        actionParts.push("Hooks active");
        detailedTooltipLines.push(`✓ Hooks (${hookCount}): Active`);
      } else {
        detailedTooltipLines.push(`✗ Hooks (${hookCount}): Skipped (unsupported in workspace repo)`);
      }
      features.hooks = { present: true, count: hookCount, workable: isSupported, items: rawHooks, reason: isSupported ? "Active" : "Unsupported" };
    }

    const summary = `Workable in ${project.name}${actionParts.length > 0 ? " · " + actionParts.join(" · ") : ""}`;
    const baseTooltip = `🟢 Workable in Project "${project.name}": Repository linked & protected (.git/info/exclude).${actionParts.length > 0 ? " Can be used with " + actionParts.join(" | ") : ""}`;
    const tooltip = detailedTooltipLines.length > 0 ? `${baseTooltip}\n${detailedTooltipLines.join("\n")}` : baseTooltip;

    return { workable: true, color: "green", status: "workable", features, summary, tooltip };
  }

  function evaluateComponentWorkability(plugin) {
    if (currentSelection.type === "ide") {
      const selectedIde = hubConfig.ides.find((i) => i.id === currentSelection.id);
      if (selectedIde && verifiedStatusByIde[selectedIde.id]?.[plugin.id]) {
        return verifiedStatusByIde[selectedIde.id][plugin.id];
      }
      return evaluateComponentAgentWorkability(plugin, selectedIde, { lastSync: selectedIde ? lastSyncByIde[selectedIde.id] : null });
    } else if (currentSelection.type === "project") {
      const selectedProj = hubConfig.projects.find((p) => p.id === currentSelection.id);
      if (selectedProj && verifiedStatusByProject[selectedProj.id]?.[plugin.id]) {
        return verifiedStatusByProject[selectedProj.id][plugin.id];
      }
      const parentIde = selectedProj ? hubConfig.ides.find((i) => i.id === selectedProj.ideId) : null;
      return evaluateComponentProjectWorkability(plugin, selectedProj, parentIde);
    }
    return {
      workable: false,
      color: "red",
      status: "failed",
      summary: "No target selected",
      tooltip: "🔴 Connection failed: No connected agent selected",
    };
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
      const isEnabled = activeMap[plugin.id] === true;
      const isFilesExpanded = expandedFiles.has(plugin.id);
      const workability = evaluateComponentWorkability(plugin);
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

            let workabilityBadge = "";
            if (workability.workable) {
              if (it.type === "skill") {
                const isW = workability.features?.skills?.workable ?? true;
                workabilityBadge = isW
                  ? `<span style="font-size:9.5px; color:#10b981; font-weight:600;" title="Skill active via slash command">✓ Workable</span>`
                  : `<span style="font-size:9.5px; color:#f59e0b; font-weight:600;" title="Agent does not support skills">⚠️ Unsupported</span>`;
              } else if (it.type === "mcp") {
                const isW = workability.features?.mcp?.workable ?? true;
                workabilityBadge = isW
                  ? `<span style="font-size:9.5px; color:#10b981; font-weight:600;" title="MCP server active">✓ Workable</span>`
                  : `<span style="font-size:9.5px; color:#f59e0b; font-weight:600;" title="Agent does not support MCP tools">⚠️ Unsupported</span>`;
              } else if (it.type === "agent") {
                const isW = workability.features?.agents?.workable ?? true;
                workabilityBadge = isW
                  ? `<span style="font-size:9.5px; color:#10b981; font-weight:600;" title="Subagent active via @ mention">✓ Workable</span>`
                  : `<span style="font-size:9.5px; color:#f59e0b; font-weight:600;" title="Agent does not support subagents">⚠️ Unsupported</span>`;
              } else if (it.type === "rule") {
                const isW = workability.features?.rules?.workable ?? true;
                workabilityBadge = isW
                  ? `<span style="font-size:9.5px; color:#10b981; font-weight:600;" title="Rule active in agent memory">✓ Workable</span>`
                  : `<span style="font-size:9.5px; color:#f59e0b; font-weight:600;" title="Agent does not support rules">⚠️ Unsupported</span>`;
              } else if (it.type === "hook") {
                const isW = workability.features?.hooks?.workable ?? true;
                workabilityBadge = isW
                  ? `<span style="font-size:9.5px; color:#10b981; font-weight:600;" title="Lifecycle hook active">✓ Workable</span>`
                  : `<span style="font-size:9.5px; color:#f59e0b; font-weight:600;" title="Agent does not support lifecycle hooks">⚠️ Unsupported</span>`;
              }
            }

            return `
              <div class="cat-item-row file-tree-item" style="display:flex; justify-content:space-between; align-items:center; padding:3.5px 8px; border-radius:4px; margin-bottom:2px; font-size:11px; background:var(--magpie-surface, rgba(128,128,128,0.04));">
                <div class="cat-item-title" style="display:flex; align-items:center; gap:6px; overflow:hidden;">
                  <span style="font-size:10px; font-weight:600; padding:1.5px 5px; border-radius:3px; background:${badgeBg}; color:${badgeColor}; flex-shrink:0;">${it.badge}</span>
                  <span style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(it.name)}</span>
                  ${it.sub ? `<span style="opacity:0.65; font-size:10px; flex-shrink:0;">(${escapeHtml(it.sub)})</span>` : ""}
                </div>
                <div class="cat-item-meta" style="display:flex; align-items:center; gap:8px; opacity:0.85; font-size:10px; flex-shrink:0; margin-left:12px;">
                  ${workabilityBadge}
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
            <span>${isFilesExpanded ? "▲ Hide" : "View"} (${filesCount})</span>
          </button>
          ${filesListHtml}
        </td>
        <td style="vertical-align:top; padding-top:12px;">${badges || `<span style="color:var(--magpie-muted);font-size:11px;">Standard</span>`}</td>
        <td style="vertical-align:top; padding-top:12px; color:var(--magpie-muted);">
          <div class="desc-status-cell">
            <span class="component-status-dot dot-${workability.color}" title="${escapeHtml(workability.tooltip)}" aria-label="${escapeHtml(workability.summary)}"></span>
            <span class="desc-text">${escapeHtml(plugin.description || "-")}</span>
          </div>
        </td>
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

        if (currentSelection.type === "ide" && verifiedStatusByIde[currentSelection.id]) {
          delete verifiedStatusByIde[currentSelection.id][plugin.id];
        } else if (currentSelection.type === "project" && verifiedStatusByProject[currentSelection.id]) {
          delete verifiedStatusByProject[currentSelection.id][plugin.id];
        }

        // Live update status dot for this component
        const newWorkability = evaluateComponentWorkability(plugin);
        const dot = row.querySelector(".component-status-dot");
        if (dot) {
          dot.className = `component-status-dot dot-${newWorkability.color}`;
          dot.title = newWorkability.tooltip;
          dot.setAttribute("aria-label", newWorkability.summary);
        }

        triggerSavePreferences();
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
        const cleanVal = (e.target.value || "").trim().replace(/^["']+|["']+$/g, "").trim();
        hubConfig.hubRoot = cleanVal;
        hubInputTimer = setTimeout(async () => {
          await reloadPluginsFromHub();
          renderAll();
          triggerAutoSync();
        }, 350);
      });
      $("hubPathInput").addEventListener("change", async (e) => {
        clearTimeout(hubInputTimer);
        const cleanVal = (e.target.value || "").trim().replace(/^["']+|["']+$/g, "").trim();
        hubConfig.hubRoot = cleanVal;
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
          $("btnPickHubFolder").textContent = "Browse...";
          if (res && !res.cancelled && res.realPath) {
            hubConfig.hubRoot = res.realPath;
            if ($("hubPathInput")) $("hubPathInput").value = res.realPath;
            await reloadPluginsFromHub();
            renderAll();
            triggerAutoSync();
          }
        } catch (err) {
          $("btnPickHubFolder").textContent = "Browse...";
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
          btnToggleAll.textContent = "Collapse All Files";
        } else {
          expandedFiles.clear();
          btnToggleAll.textContent = "Expand All Files";
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

    // Standardize Storage Structure Prompt Copy Button (with version display)
    const STORAGE_PROMPT_VERSION = "V1.0";
    const btnCopyPrompt = $("btnCopyStoragePrompt");
    if (btnCopyPrompt) {
      const originalText = `Copy Prompt (${STORAGE_PROMPT_VERSION})`;
      btnCopyPrompt.textContent = originalText;
      btnCopyPrompt.addEventListener("click", async () => {
        const effectiveHub = computeEffectiveHubPath();
        const storagePath = effectiveHub?.path || "";
        const targetPathHeader = storagePath ? `Components Storage Target Path: ${storagePath}\n\n` : "";

        const promptText = `[Components Storage Specification & Upstream Rules Prompt ${STORAGE_PROMPT_VERSION}]

Please organize and force our Components Storage file structure to strictly adhere to the standard plugin specification, record mandatory upstream source links, eliminate decentralized component updaters, and install a persistent agent rule:

${targetPathHeader}1. Directory Structure Specification:
A plugin is a directory containing a required manifest file (plugin.json) and optional subdirectories for customizations:

plugins/<plugin-name>/
├── plugin.json       # Required manifest file (must include "upstream" source URL)
├── mcp_config.json   # Optional MCP server definitions
├── hooks.json        # Optional hooks definition
├── skills/           # Optional skills directory
│   └── <upstream GitHub name/self (if self created)-skill-name>/
│       └── SKILL.md  # Must include upstream: <url> in YAML frontmatter
├── agents/           # Optional subagent definition templates
│   └── <upstream GitHub name/self (if self created)-agent-name>.md  # Must include upstream in frontmatter
└── rules/            # Optional rules directory
    └── <upstream GitHub name/self (if self created)-rule-name>.md    # Must include upstream in frontmatter

2. Mandatory Upstream Links:
For EVERY component (plugin, skill, rule, agent, MCP) installed in Components Storage Path:
- Identify and record the upstream source link (GitHub repository URL, official documentation URL, or author registry link) where the component was saved or fetched from:
  * In plugin.json: Include "upstream": "https://github.com/<owner>/<repo>" (or source repository URL).
  * In SKILL.md: Include upstream: "https://github.com/<owner>/<repo>" in the YAML frontmatter.
  * In rules (*.md): Include upstream: "https://github.com/<owner>/<repo>" in the YAML frontmatter.
  * In agents (*.md): Include upstream: "https://github.com/<owner>/<repo>" in the YAML frontmatter.

3. Centralized Weekly Update Checking (No Decentralized Scripts):
- Remove and DO NOT create individual, local, or decentralized update scripts (such as update_checker.mjs or update_check_state.json) inside component folders.
- Update checking for all components in Components Storage Path is centralized once per week in this Agent Space Manager plugin (running automatically on the first day starting on Monday whenever the user starts up Magpie).
- Prune any obsolete local component update checking scripts or decentralized state files.

4. Mandatory Persistent Agent Rule:
Install and persist a dedicated rule in your agent's rule system (e.g. .agents/rules/components-storage-upstream-rule.md or .cursor/rules/components-storage-upstream-rule.mdc) that is ALWAYS TRIGGERED whenever an addendum, creation, modification, or edit is made to any component in the Components Storage Path (${storagePath || "Components Storage Path"}):
- Rule Trigger: Addendum, creation, or edit of any component in Components Storage Path.
- Rule Invariant 1: Ensure strict compliance with the plugin directory structure above.
- Rule Invariant 2: Always add and preserve the upstream link in the component's manifest or frontmatter.
- Rule Invariant 3: Never introduce decentralized or component-level update scripts; all update checking is handled centrally by the Agent Space Manager plugin on Monday startup.

Please inspect ${storagePath || "Components Storage Path"}, clean up non-conforming or loose files, ensure all component manifests and frontmatters contain their upstream links, purge any decentralized update checking scripts, and persist the rule into your agent's rules.`;

        let copied = false;
        if (navigator.clipboard && navigator.clipboard.writeText) {
          try {
            await navigator.clipboard.writeText(promptText);
            copied = true;
          } catch {}
        }
        if (!copied) {
          try {
            const ta = document.createElement("textarea");
            ta.value = promptText;
            ta.style.position = "fixed";
            ta.style.opacity = "0";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
            copied = true;
          } catch {}
        }

        btnCopyPrompt.textContent = copied ? "Copied!" : "Copy Failed";
        btnCopyPrompt.classList.add("copied");
        setTimeout(() => {
          btnCopyPrompt.textContent = originalText;
          btnCopyPrompt.classList.remove("copied");
        }, 2000);
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
          $("btnBrowseIdeExe").textContent = "Browse...";
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
          $("btnBrowseIdeExe").textContent = "Browse...";
          console.warn("Browse IDE binary error:", err);
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
          $("btnBrowseProjectPath").textContent = "Browse...";
          if (res && !res.cancelled && res.realPath) {
            if ($("projectPathInput")) $("projectPathInput").value = res.realPath;
            if ($("projectNameInput")) $("projectNameInput").value = res.name;
          }
        } catch (err) {
          $("btnBrowseProjectPath").textContent = "Browse...";
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
          showToast("Please provide an Agent/IDE name and configuration path.", "error");
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
          const normConfig = (configPath || "").trim().toLowerCase().replace(/\\/g, "/");
          const existing = hubConfig.ides.find((i) =>
            i.id === baseId ||
            (agentType && agentType !== "custom" && i.agentType === agentType) ||
            (normConfig && (i.configPath || "").trim().toLowerCase().replace(/\\/g, "/") === normConfig)
          );

          if (existing) {
            // Update in-place to avoid duplicate agents and bridges (Requirement R3)
            existing.name = name;
            existing.agentType = agentType;
            existing.exePath = exePath;
            existing.configPath = configPath;
            existing.componentPaths = componentPaths;
            currentSelection = { type: "ide", id: existing.id };
          } else {
            hubConfig.ides.push({ id: baseId, name, agentType, exePath, configPath, componentPaths, enabled: true, plugins: {} });
            currentSelection = { type: "ide", id: baseId };
          }
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
          showToast("Please provide project name and repository path.", "error");
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

    // Status Checking Progress Modal
    if ($("closeStatusCheckingModal")) $("closeStatusCheckingModal").addEventListener("click", () => statusCheckingUI.hide());
    if ($("btnBackgroundStatusCheck")) $("btnBackgroundStatusCheck").addEventListener("click", () => statusCheckingUI.hide());
    if ($("btnDoneStatusCheck")) $("btnDoneStatusCheck").addEventListener("click", () => statusCheckingUI.hide());

    // Connect button: Explicit manual connection trigger (Requirements R1, R2, R3)
    const connectBtn = $("connectBtn");
    if (connectBtn) {
      connectBtn.addEventListener("click", async () => {
        let target = null;
        let targetName = "";
        let isProject = false;

        if (currentSelection.type === "ide") {
          target = hubConfig.ides.find((i) => i.id === currentSelection.id);
          targetName = target?.name || target?.id || "Agent";
        } else if (currentSelection.type === "project") {
          isProject = true;
          const proj = hubConfig.projects.find((p) => p.id === currentSelection.id);
          const parentIde = proj ? hubConfig.ides.find((i) => i.id === proj.ideId) : null;
          target = parentIde ? { ...parentIde, project: proj } : { id: proj?.id, agentType: "custom", configPath: proj?.repoPath, plugins: proj?.plugins };
          targetName = proj?.name || "Project";
        }

        if (!target) {
          showToast("No agent or project selected to connect.", "error");
          return;
        }

        connectBtn.disabled = true;
        const origText = "Connect";
        connectBtn.textContent = "Connecting...";
        const indicator = $("syncIndicator");
        if (indicator) {
          indicator.textContent = `Connecting to ${targetName}...`;
          indicator.className = "sync-indicator syncing";
        }

        try {
          // 1. Ensure current configuration preferences are persisted first
          await persistConfig(false, { connect: false, sync: false });

          // 2. Execute explicit connection
          let connectRes = null;
          if (isProject) {
            connectRes = await apiClient.saveConfig(hubConfig, { sync: true, connect: true });
          } else {
            connectRes = await apiClient.connectTarget(target);
          }

          if (connectRes && connectRes.success !== false) {
            let syncResult = connectRes.result || connectRes.sync;
            if (connectRes.sync?.results) {
              for (const r of connectRes.sync.results) {
                if (r.ideId) lastSyncByIde[r.ideId] = r;
                if (r.projectId && r.projectId === target.id) syncResult = r;
              }
            } else if (target.id) {
              lastSyncByIde[target.id] = syncResult || { success: true };
            }

            connectBtn.textContent = "✓ Connected";
            connectBtn.style.background = "#16a34a";
            connectBtn.style.borderColor = "transparent";

            if (indicator) {
              indicator.textContent = "Connected";
              indicator.className = "sync-indicator";
            }

            let summaryStr = "Synchronized";
            if (syncResult?.summary) {
              const s = syncResult.summary;
              if (syncResult.mode === "bundle") {
                summaryStr = `${s.plugins || 0} plugin bundle(s)`;
              } else {
                summaryStr = `${s.skills || 0} skills · ${s.mcp || 0} MCP`;
              }
            }
            showToast(`Connected to ${targetName} (${summaryStr})`, "success");

            renderAll();

            setTimeout(() => {
              connectBtn.disabled = false;
              connectBtn.textContent = origText;
              connectBtn.style.background = "";
              connectBtn.style.borderColor = "";
            }, 2500);
          } else {
            const errMsg = connectRes?.error || "Connection failed";
            connectBtn.textContent = "✗ Failed";
            connectBtn.style.background = "#dc2626";
            connectBtn.style.borderColor = "transparent";

            if (indicator) {
              indicator.textContent = "Connection Failed";
              indicator.className = "sync-indicator";
            }

            showToast(`Connection failed to ${targetName}: ${errMsg}`, "error");

            setTimeout(() => {
              connectBtn.disabled = false;
              connectBtn.textContent = origText;
              connectBtn.style.background = "";
              connectBtn.style.borderColor = "";
            }, 3000);
          }
        } catch (err) {
          console.error("Connect error:", err);
          connectBtn.textContent = "✗ Error";
          showToast(`Connect error: ${err.message}`, "error");

          setTimeout(() => {
            connectBtn.disabled = false;
            connectBtn.textContent = origText;
            connectBtn.style.background = "";
            connectBtn.style.borderColor = "";
          }, 3000);
        }
      });
    }

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
          hubConfig.hubRoot = ($("hubPathInput").value || "").trim().replace(/^["']+|["']+$/g, "").trim();
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
          const resp = await fetch(`${API_BASE}/api/rescan`, {
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
            <div style="font-size:11px; color:#10b981; margin-top:2px;">Status: All connected agents synchronized with live handoff inboxes in ${escapeHtml(effectivePath || "Components Storage")}</div>
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

    // Dismiss button for startup auto-reconnect banner
    if ($("btnDismissStartupBanner")) {
      $("btnDismissStartupBanner").addEventListener("click", () => {
        const banner = $("startupReconnectBanner");
        if (banner) banner.style.display = "none";
      });
    }
  }

  function renderStartupReconnectStatus(result) {
    const banner = $("startupReconnectBanner");
    const msg = $("startupReconnectMsg");
    const title = $("startupReconnectTitle");
    const icon = $("startupReconnectIcon");
    const badge = $("hubPathBadge");

    if (!banner || !msg) return;

    if (result?.hasChanges && result?.autoReconnected) {
      banner.style.display = "flex";
      banner.className = "startup-reconnect-banner active";
      if (title) title.textContent = "⚡ Auto-reconnected Connected Agents";
      if (icon) icon.textContent = "⚡";
      let text = `Detected changes in Components Storage Path: ${result.summary}. Auto-reconnected ${result.connectedAgentsCount || 0} agent(s).`;
      if (result.centralUpdates?.checked) {
        text += ` • ${result.centralUpdates.summary}`;
      }
      msg.textContent = text;
      if (badge && !badge.classList.contains("disabled")) {
        badge.textContent = "✓ Auto-Synced on Startup";
        badge.className = "hub-path-badge auto";
      }
    } else if (result?.centralUpdates?.checked) {
      banner.style.display = "flex";
      banner.className = "startup-reconnect-banner active";
      if (title) title.textContent = "📅 Centralized Weekly Upstream Check";
      if (icon) icon.textContent = "📅";
      msg.textContent = `${result.centralUpdates.summary} (Centralized Monday weekly check)`;
      if (badge && !badge.classList.contains("disabled") && (!hubConfig.hubRoot || hubConfig.hubRoot.trim() === "")) {
        badge.textContent = "✓ Upstream Verified";
        badge.className = "hub-path-badge auto";
      }
    } else if (result && result.hasChanges === false) {
      if (badge && !badge.classList.contains("disabled") && (!hubConfig.hubRoot || hubConfig.hubRoot.trim() === "")) {
        badge.textContent = "✓ In Sync with Storage";
        badge.className = "hub-path-badge auto";
      }
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

  let savePreferencesTimer = null;
  // Preference Persistence: Saves user checkbox selections without auto-connecting (Requirements R1 & R2)
  function triggerSavePreferences() {
    const indicator = $("syncIndicator");
    if (indicator) {
      indicator.textContent = "Saving preferences...";
      indicator.className = "sync-indicator syncing";
    }

    clearTimeout(savePreferencesTimer);
    savePreferencesTimer = setTimeout(async () => {
      await persistConfig(false, { connect: false, sync: false });
      if (indicator) {
        indicator.textContent = "Preferences saved";
        indicator.className = "sync-indicator";
      }
    }, 450);
  }

  // Auto-Save configuration without automatic agent connection
  function triggerAutoSync(options = { connect: false, sync: false }) {
    const indicator = $("syncIndicator");
    if (indicator) {
      indicator.textContent = "Saving...";
      indicator.className = "sync-indicator syncing";
    }

    clearTimeout(autoSyncTimer);
    autoSyncTimer = setTimeout(async () => {
      await persistConfig(false, options);
      if (indicator) {
        indicator.textContent = "Saved";
        indicator.className = "sync-indicator";
      }
    }, 450);
  }

  async function persistConfig(forceRescan = false, options = { connect: false, sync: false }) {
    try {
      localStorage.setItem("magpie_agent_space_config", JSON.stringify(hubConfig));
    } catch {}

    // 1. Try direct API server first (works in browser / unrestricted WebView)
    const saveRes = await apiClient.saveConfig(hubConfig, options);
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
