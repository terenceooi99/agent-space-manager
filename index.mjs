// D:\Software\Magpie\agent-space-manager\index.mjs
// Magpie Plugin Entrypoint for Agent Space Manager & Smart Middleware

import { onRequest, onResponse } from "./smart-tools.middleware.js";
import { startApiServer } from "./server.mjs";

try {
  startApiServer();
} catch {}
import {
  loadHubConfig,
  saveHubConfig,
  scanPlugins,
  syncIdePlugins,
  syncAllIdes,
  unlinkAllForIde,
  detectAgentConfigPath,
  createJunction,
  removeJunction,
  resolveDroppedTarget,
  browseFileSystem,
  inferNameFromExe,
  resolveShortcutTarget,
  buildCategoriesRegistry,
} from "./manager.mjs";

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
    saveConfig: async (config) => {
      saveHubConfig(config);
      const plugins = scanPlugins(config.hubRoot);
      const categories = buildCategoriesRegistry(plugins, config.hubRoot);
      syncAllIdes(config, plugins);
      return { success: true, pluginCount: plugins.length, plugins, categories };
    },
    getPlugins: async (customHubRoot) => {
      if (customHubRoot !== undefined && customHubRoot !== null && customHubRoot !== "") {
        return scanPlugins(customHubRoot);
      }
      const cfg = loadHubConfig();
      return scanPlugins(cfg.hubRoot);
    },
    syncAll: async (customConfig) => {
      const cfg = customConfig || loadHubConfig();
      const plugins = scanPlugins(cfg.hubRoot);
      return syncAllIdes(cfg, plugins);
    },
    detectConfigPath: async (name, exePath) => {
      return detectAgentConfigPath(name, exePath);
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
      const plugins = scanPlugins(cfg.hubRoot);
      return syncIdePlugins(ide, plugins);
    },
    removeIde: async (ideId) => {
      const cfg = loadHubConfig();
      const ideIndex = cfg.ides.findIndex((i) => i.id === ideId);
      if (ideIndex === -1) return { success: false, error: "IDE not found" };

      const ide = cfg.ides[ideIndex];
      const plugins = scanPlugins(cfg.hubRoot);

      // Sever all junctions created in this IDE
      unlinkAllForIde(ide);

      // Remove from config and persist
      cfg.ides.splice(ideIndex, 1);
      // Clean associated project overrides
      cfg.projects = cfg.projects.filter((p) => p.ideId !== ideId);
      saveHubConfig(cfg);

      return { success: true };
    },
  },
};

export default AgentSpaceManagerPlugin;
