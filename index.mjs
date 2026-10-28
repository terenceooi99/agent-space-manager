// D:\Software\Magpie\agent-space-manager\index.mjs
// Magpie Plugin Entrypoint for Agent Space Manager & Smart Middleware

import { onRequest, onResponse } from "./smart-tools.middleware.js";
import { startApiServer, ensureBackgroundDaemon } from "./server.mjs";
import {
  loadHubConfig,
  saveHubConfig,
  scanPlugins,
  syncIdePlugins,
  syncAllIdes,
  unlinkAllForIde,
  unlinkAllForProject,
  detectAgentConfigPath,
  createJunction,
  removeJunction,
  resolveDroppedTarget,
  browseFileSystem,
  inferNameFromExe,
  resolveShortcutTarget,
  buildCategoriesRegistry,
  getEffectiveHubRoot,
  listAgentProfilesForUi,
  inferAgentType,
} from "./manager.mjs";

if (!process.env.ASM_NO_SERVER) {
  try {
    startApiServer();
    ensureBackgroundDaemon();
  } catch {}
}

export { onRequest, onResponse };

export const AgentSpaceManagerPlugin = {
  name: "agent-space-manager",
  onRequest,
  onResponse,

  // Magpie IPC / Plugin API for the Web UI
  api: {
    getConfig: async () => {
      return loadHubConfig();
    },
    getAgentProfiles: async () => {
      return listAgentProfilesForUi();
    },
    saveConfig: async (config) => {
      saveHubConfig(config);
      const effHub = getEffectiveHubRoot(config);
      const plugins = scanPlugins(effHub);
      const categories = buildCategoriesRegistry(plugins, effHub);
      const sync = syncAllIdes(config, plugins);
      return { success: true, pluginCount: plugins.length, plugins, categories, sync };
    },
    getPlugins: async (customHubRoot) => {
      if (customHubRoot !== undefined && customHubRoot !== null && customHubRoot !== "") {
        return scanPlugins(customHubRoot);
      }
      const cfg = loadHubConfig();
      return scanPlugins(getEffectiveHubRoot(cfg));
    },
    syncAll: async (customConfig) => {
      const cfg = customConfig || loadHubConfig();
      const plugins = scanPlugins(getEffectiveHubRoot(cfg));
      return syncAllIdes(cfg, plugins);
    },
    detectConfigPath: async (name, exePath) => {
      return detectAgentConfigPath(name, exePath);
    },
    inferAgentType: async (name, exePath, configPath) => {
      return inferAgentType(name, exePath, configPath);
    },
    resolveDroppedTarget: async (rawNameOrPath, mode) => {
      return resolveDroppedTarget(rawNameOrPath, mode);
    },
    browseFileSystem: async (type) => {
      return browseFileSystem(type);
    },
    syncIde: async (ideId) => {
      const cfg = loadHubConfig();
      const ide = cfg.ides.find((i) => i.id === ideId);
      if (!ide) return { success: false, error: "IDE not found" };
      const plugins = scanPlugins(getEffectiveHubRoot(cfg));
      return syncIdePlugins(ide, plugins);
    },
    removeIde: async (ideId, killProcesses = false) => {
      const cfg = loadHubConfig();
      const ideIndex = cfg.ides.findIndex((i) => i.id === ideId);
      if (ideIndex === -1) return { success: false, error: "IDE not found" };

      const ide = cfg.ides[ideIndex];

      // Sever all junctions, MCP keys, rule blocks, and copied files created in this IDE
      unlinkAllForIde(ide, killProcesses);

      // Remove from config and persist
      cfg.ides.splice(ideIndex, 1);
      // Clean associated project overrides
      cfg.projects = (cfg.projects || []).filter((p) => p.ideId !== ideId);
      saveHubConfig(cfg);
      const eff = getEffectiveHubRoot(cfg);
      syncAllIdes(cfg, scanPlugins(eff));

      return { success: true };
    },
    removeProject: async (projectId) => {
      const cfg = loadHubConfig();
      const projIdx = (cfg.projects || []).findIndex((p) => p.id === projectId);
      if (projIdx === -1) return { success: false, error: "Project not found" };

      const project = cfg.projects[projIdx];
      const parentIde = (cfg.ides || []).find((i) => i.id === project.ideId) || null;
      unlinkAllForProject(project, parentIde);

      cfg.projects.splice(projIdx, 1);
      saveHubConfig(cfg);
      const eff = getEffectiveHubRoot(cfg);
      syncAllIdes(cfg, scanPlugins(eff));

      return { success: true };
    },
    rescan: async (customHubRoot) => {
      const cfg = loadHubConfig();
      if (customHubRoot && typeof customHubRoot === "string") {
        cfg.hubRoot = customHubRoot.trim();
        saveHubConfig(cfg);
      }
      const effHub = getEffectiveHubRoot(cfg);
      const plugins = scanPlugins(effHub);
      const categories = buildCategoriesRegistry(plugins, effHub);
      const syncRes = syncAllIdes(cfg, plugins);
      return { success: true, hubRoot: effHub, count: plugins.length, plugins, categories, sync: syncRes };
    },
  },
};

export default AgentSpaceManagerPlugin;
