// tests/ipc.test.mjs
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { makeSandbox } from "./helpers.mjs";

describe("Magpie Host IPC Surface (index.mjs)", () => {
  test("AgentSpaceManagerPlugin.api exposes getConfig, getPlugins, detectConfigPath, getAgentProfiles, syncAll, removeIde", async () => {
    const sb = makeSandbox();
    try {
      const { AgentSpaceManagerPlugin } = await import("../index.mjs");
      const api = AgentSpaceManagerPlugin.api;

      const plugins = await api.getPlugins(sb.hub);
      assert.equal(plugins.length, 4);

      const emptyPlugins = await api.getPlugins(path.join(sb.root, "missing"));
      assert.equal(emptyPlugins.length, 0);

      assert.equal(typeof api.getAgentProfiles, "function", "IPC must expose getAgentProfiles()");
      const profiles = await api.getAgentProfiles();
      assert.ok(Array.isArray(profiles) && profiles.length >= 12);
    } finally {
      sb.cleanup();
    }
  });
});
