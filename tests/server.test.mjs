// tests/server.test.mjs
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { makeSandbox } from "./helpers.mjs";

describe("Feature 9 & 11: REST API Server, Agent Profiles Endpoint & CORS Security", () => {
  test("Server serves /api/status, /api/agents, /api/plugins, /api/save and blocks cross-origin POST from foreign websites", async () => {
    const sb = makeSandbox();
    try {
      const { startApiServer } = await import("../server.mjs");
      const srv = startApiServer(0); // ephemeral port
      await new Promise((resolve) => srv.once("listening", resolve));
      const port = srv.address().port;
      const base = `http://127.0.0.1:${port}`;

      try {
        // 1. /api/status
        const st = await fetch(`${base}/api/status`).then((r) => r.json());
        assert.equal(st.status, "ok");

        // 2. /api/agents returns major agent profiles
        const ag = await fetch(`${base}/api/agents`).then((r) => r.json());
        assert.equal(ag.success, true);
        assert.ok(Array.isArray(ag.agents));
        assert.ok(ag.agents.some((a) => a.id === "claude-code"));
        assert.ok(ag.agents.some((a) => a.id === "codex"));

        // 3. /api/plugins with valid hub vs invalid path
        const plValid = await fetch(`${base}/api/plugins?path=${encodeURIComponent(sb.hub)}`).then((r) => r.json());
        assert.equal(plValid.count, 4);

        const plInvalid = await fetch(`${base}/api/plugins?path=${encodeURIComponent("C:\\Usersyuur6ujrjjh")}`).then((r) => r.json());
        assert.equal(plInvalid.count, 0);
        assert.deepEqual(plInvalid.plugins, []);

        // 3b. /api/save with invalid hubRoot returns 0 plugins and writes count=0 to plugins-cache.json
        const saveInvalid = await fetch(`${base}/api/save`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ hubRoot: "C:\\Usersyuur6ujrjjh", ides: [] }),
        }).then((r) => r.json());
        assert.equal(saveInvalid.success, true);
        assert.equal(saveInvalid.pluginCount, 0);
        assert.deepEqual(saveInvalid.plugins, []);

        // 4. Cross-origin POST from evil website must be rejected (403)
        const evilRes = await fetch(`${base}/api/save`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://evil.example.com",
          },
          body: JSON.stringify({ hubRoot: sb.hub, ides: [] }),
        });
        assert.equal(evilRes.status, 403, "Must reject foreign Origin on mutating endpoints");
      } finally {
        srv.close();
      }
    } finally {
      sb.cleanup();
    }
  });
});
