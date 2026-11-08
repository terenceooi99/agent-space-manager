// D:\Software\Magpie\agent-space-manager\index.mjs
// Magpie Plugin Entrypoint for Agent Space Manager & Smart Middleware

import { onRequest, onResponse } from "./smart-tools.middleware.js";
import { startApiServer, ensureBackgroundDaemon, handleOmnirouteRequest, runOmnirouteAction } from "./server.mjs";
import {
  loadHubConfig,
  saveHubConfig,
  scanPlugins,
  connectAgent,
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
  checkComponentsModifications,
  checkAndAutoReconnectOnStartup,
  getComponentsStorageSnapshot,
  evaluateComponentAgentWorkability,
  verifyPluginWorkabilityOnDisk,
  recheckConnectedAgentsStatus,
  removeComponentUpdateMechanisms,
  checkCentralizedUpstreamUpdates,
  loadCentralizedUpstreamUpdateState,
  collectAllComponentsUpstream,
  getOmniroutePort,
  isOmnirouteInstalled,
  checkOmnirouteStatus,
  startOmniroute,
  stopOmniroute,
  stopOmnirouteSync,
  isMagpieRunning,
  openUrlInBrowser,
  scanAgentForeignComponents,
  cleanAgentForeignComponents,
  autoEnableHubComponents,
} from "./manager.mjs";

if (!process.env.ASM_NO_SERVER && process.env.NODE_ENV !== "test" && process.env.ASM_TEST !== "1") {
  try {
    startApiServer();
  } catch {}

  const onProcessSignal = () => {
    try {
      stopOmnirouteSync();
    } catch {}
    process.exit(0);
  };
  process.on("SIGINT", onProcessSignal);
  process.on("SIGTERM", onProcessSignal);

  if (process.stdin && typeof process.stdin.on === "function" && process.stdin.readable) {
    process.stdin.on("close", async () => {
      try {
        const alive = await isMagpieRunning();
        if (!alive) {
          stopOmnirouteSync();
        }
      } catch {}
    });
  }
}

export {
  onRequest,
  onResponse,
  recheckConnectedAgentsStatus,
  verifyPluginWorkabilityOnDisk,
};

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
    saveConfig: async (config, options = {}) => {
      saveHubConfig(config);
      const effHub = getEffectiveHubRoot(config);
      const plugins = scanPlugins(effHub);
      const categories = buildCategoriesRegistry(plugins, effHub);
      const shouldSync = Boolean(
        options.sync === true ||
        options.connect === true ||
        config?.sync === true ||
        config?.connect === true
      );
      const sync = shouldSync ? syncAllIdes(config, plugins) : null;
      return {
        success: true,
        pluginCount: plugins.length,
        plugins,
        categories,
        synced: shouldSync,
        ...(sync ? { sync } : {}),
      };
    },
    connectAgent: async (hubConfigOrIde, targetIdeOrOptions = {}, options = {}) => {
      let hubConfig;
      let targetIde;
      let opts;
      if (hubConfigOrIde && Array.isArray(hubConfigOrIde.ides)) {
        hubConfig = hubConfigOrIde;
        targetIde = targetIdeOrOptions;
        opts = options || {};
      } else {
        hubConfig = loadHubConfig();
        targetIde = hubConfigOrIde;
        opts = targetIdeOrOptions || {};
      }
      return connectAgent(hubConfig, targetIde, opts);
    },
    getPlugins: async (customHubRoot) => {
      if (customHubRoot !== undefined && customHubRoot !== null && customHubRoot !== "") {
        return scanPlugins(customHubRoot);
      }
      const cfg = loadHubConfig();
      return scanPlugins(getEffectiveHubRoot(cfg));
    },
    scanPlugins: async (customHubRoot) => {
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
    checkModifications: async (customHubRoot) => {
      return checkComponentsModifications(customHubRoot);
    },
    startupSync: async (customConfig) => {
      return checkAndAutoReconnectOnStartup(customConfig);
    },
    recheckStatus: async (customConfig) => {
      const cfg = customConfig || loadHubConfig();
      const plugins = scanPlugins(getEffectiveHubRoot(cfg));
      return recheckConnectedAgentsStatus(cfg, plugins);
    },
    getComponentsSnapshot: async (customHubRoot) => {
      return getComponentsStorageSnapshot(getEffectiveHubRoot(customHubRoot));
    },
    evaluateWorkability: (plugin, ide, options) => {
      return evaluateComponentAgentWorkability(plugin, ide, options);
    },
    verifyPluginWorkabilityOnDisk: (plugin, ide, options) => {
      return verifyPluginWorkabilityOnDisk(plugin, ide, options);
    },
    removeComponentUpdateMechanisms: async (customHubRoot) => {
      return removeComponentUpdateMechanisms(customHubRoot);
    },
    checkCentralizedUpdates: async (customHubRoot, options) => {
      return checkCentralizedUpstreamUpdates(customHubRoot, options);
    },
    getCentralizedUpdateStatus: async (customHubRoot) => {
      return loadCentralizedUpstreamUpdateState(customHubRoot);
    },
    collectUpstreams: async (customHubRoot) => {
      return collectAllComponentsUpstream(customHubRoot);
    },
    getOmnirouteStatus: async (customPort) => {
      return runOmnirouteAction("status", customPort);
    },
    startOmniroute: async (customPort) => {
      return runOmnirouteAction("start", customPort);
    },
    stopOmniroute: async (customPort) => {
      return runOmnirouteAction("stop", customPort);
    },
    isMagpieRunning: async () => {
      return isMagpieRunning();
    },
    openOmnirouteUrl: async (url, customPort) => {
      const cfg = loadHubConfig();
      const port = customPort || getOmniroutePort(cfg);
      const targetUrl = url || `http://localhost:${port}`;
      const ok = openUrlInBrowser(targetUrl);
      return { success: ok, url: targetUrl };
    },
    scanForeignComponents: async (agent) => {
      const cfg = loadHubConfig();
      const effHub = getEffectiveHubRoot(cfg);
      const plugins = scanPlugins(effHub);
      return scanAgentForeignComponents(agent, cfg, plugins);
    },
    cleanForeignComponents: async (components) => {
      return cleanAgentForeignComponents(components);
    },
    autoEnableHubComponents: async (agent) => {
      const cfg = loadHubConfig();
      const effHub = getEffectiveHubRoot(cfg);
      const plugins = scanPlugins(effHub);
      return autoEnableHubComponents(agent, cfg, plugins);
    },
  },
};

export async function server(input = {}, rawOptions = {}) {
  const opts = rawOptions || {};
  if (opts.omnirouteRequest) {
    handleOmnirouteRequest(opts.omnirouteRequest);
  }
  return {};
}

AgentSpaceManagerPlugin.server = server;

export default AgentSpaceManagerPlugin;
