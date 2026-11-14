// tests/middleware.test.mjs
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { makeSandbox } from "./helpers.mjs";

describe("Feature 10: Smart Middleware Tool Gateway", () => {
  const makeTools = (count = 140) => {
    const core = ["read_file", "write_file", "edit_file", "run_command", "search_web"];
    const domain = ["github_create_issue", "flutter_run", "crw_scrape", "rizin_disasm", "create_user_record"];
    const tools = [];
    for (const name of [...core, ...domain]) {
      tools.push({ function: { name } });
    }
    while (tools.length < count) {
      tools.push({ function: { name: `extra_tool_${tools.length}` } });
    }
    return tools;
  };

  test("bypasses when smartMiddlewareEnabled is false", async () => {
    const sb = makeSandbox();
    try {
      const { onRequest } = await import("../smart-tools.middleware.js");
      const body = { tools: makeTools(140), messages: [{ role: "user", content: "hello" }] };
      const out = onRequest(body, { options: { smartMiddlewareEnabled: false } });
      assert.equal(out, undefined);
    } finally {
      sb.cleanup();
    }
  });

  test("pure chat greeting keeps core tools and caps total tools", async () => {
    const sb = makeSandbox();
    try {
      const { onRequest } = await import("../smart-tools.middleware.js");
      const tools = [
        { function: { name: "misc_1" } },
        ...Array.from({ length: 25 }, (_, i) => ({ function: { name: `other_${i}` } })),
        { function: { name: "read_file" } },
      ];
      const out = onRequest(
        { tools, messages: [{ role: "user", content: "hi!" }] },
        { options: { smartMiddlewareEnabled: true, maxTools: 96 } }
      );
      const names = out.tools.map((t) => t.function.name);
      assert.ok(names.includes("read_file"), "Pure chat must still retain core tools like read_file");
      assert.ok(out.tools.length <= 15);
    } finally {
      sb.cleanup();
    }
  });

  test("does not false-positive match 'create_user_record' as reverse-engineering ('rea') and fills up to maxTools cap", async () => {
    const sb = makeSandbox();
    try {
      const { onRequest } = await import("../smart-tools.middleware.js");
      const tools = makeTools(140);
      // Prompt mentions 'binary', which triggers reverse-engineering bucket
      const out = onRequest(
        {
          tools,
          messages: [
            { role: "assistant", content: "I can help with flutter or github" }, // assistant text should be ignored
            { role: "user", content: "inspect this binary" },
          ],
        },
        { options: { smartMiddlewareEnabled: true, maxTools: 50 } }
      );
      const names = out.tools.map((t) => t.function.name);
      assert.equal(out.tools.length, 50, "Should fill remaining slots up to maxSafeTools (50)");
      assert.ok(names.includes("rizin_disasm"), "Matched domain tool must be prioritized");
      // Priority check: matched tools come before fallback tools
      const rizinIdx = names.indexOf("rizin_disasm");
      const createIdx = names.indexOf("create_user_record");
      assert.ok(rizinIdx < createIdx, "rizin_disasm should be prioritized ahead of unrelated create_user_record");
    } finally {
      sb.cleanup();
    }
  });

  test("dynamically matches custom user intents from shared/middleware-intents.json", async () => {
    const sb = makeSandbox();
    try {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const { onRequest } = await import("../smart-tools.middleware.js");

      const sharedDir = path.join(sb.hub, "shared");
      fs.mkdirSync(sharedDir, { recursive: true });
      fs.writeFileSync(
        path.join(sharedDir, "middleware-intents.json"),
        JSON.stringify({
          docker: {
            toolPatterns: ["worker_container", "docker_build"],
            intentKeywords: ["docker", "container", "dockerfile"],
          },
        }),
        "utf8"
      );

      const tools = [
        { function: { name: "read_file" } },
        { function: { name: "worker_container" } },
        { function: { name: "unrelated_cloud_tool" } },
        ...Array.from({ length: 40 }, (_, i) => ({ function: { name: `extra_${i}` } })),
      ];

      const out = onRequest(
        {
          tools,
          messages: [{ role: "user", content: "Can you compile and run this dockerfile?" }],
        },
        { options: { smartMiddlewareEnabled: true, maxTools: 30 } }
      );

      const names = out.tools.map((t) => t.function.name);
      assert.ok(names.includes("worker_container"), "Custom intent tool worker_container must be matched and kept");
      const containerIdx = names.indexOf("worker_container");
      const unrelatedIdx = names.indexOf("unrelated_cloud_tool");
      assert.ok(containerIdx < unrelatedIdx, "worker_container should be prioritized ahead of unrelated tools");
    } finally {
      sb.cleanup();
    }
  });

  test("supports options.customIntents and handles malformed middleware-intents.json gracefully", async () => {
    const sb = makeSandbox();
    try {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const { onRequest } = await import("../smart-tools.middleware.js");

      // Corrupt the file to test resilience
      const sharedDir = path.join(sb.hub, "shared");
      fs.mkdirSync(sharedDir, { recursive: true });
      fs.writeFileSync(path.join(sharedDir, "middleware-intents.json"), "{ corrupted json ...", "utf8");

      const tools = [
        { function: { name: "read_file" } },
        { function: { name: "k8s_deploy" } },
        { function: { name: "misc_tool" } },
      ];

      // Should not throw, and options.customIntents should still work
      const out = onRequest(
        {
          tools,
          messages: [{ role: "user", content: "deploy this app to production cluster" }],
        },
        {
          options: {
            smartMiddlewareEnabled: true,
            maxTools: 20,
            customIntents: {
              k8s: {
                toolPatterns: ["k8s_deploy"],
                intentKeywords: ["cluster", "deploy", "kubernetes"],
              },
            },
          },
        }
      );

      const names = out.tools.map((t) => t.function.name);
      assert.ok(names.includes("k8s_deploy"), "k8s_deploy should be matched via customIntents option");
      assert.ok(names.includes("read_file"), "Core tools must still be preserved");
    } finally {
      sb.cleanup();
    }
  });

  test("auto-seeds initial personal layer from existing plugins and trims on uninstall", async () => {
    const sb = makeSandbox();
    try {
      const fs = await import("node:fs");
      const path = await import("node:path");
      const { autoSeedMiddlewareIntents, trimMiddlewareIntent } = await import("../smart-tools.middleware.js");

      const intentsPath = path.join(sb.hub, "shared", "middleware-intents.json");
      assert.ok(!fs.existsSync(intentsPath), "intents file should not exist initially");

      // 1. Auto-seed based on what is in sb.hub (which has alpha-plugin and beta-plugin)
      const seeded = autoSeedMiddlewareIntents(sb.hub);
      assert.ok(fs.existsSync(intentsPath), "autoSeed must create shared/middleware-intents.json");
      assert.ok(seeded["alpha-plugin"], "Should seed alpha-plugin");
      assert.ok(seeded["beta-plugin"], "Should seed beta-plugin");
      assert.ok(seeded["alpha-plugin"].toolPatterns.includes("alpha-mcp"), "Should index alpha-mcp from mcp_config.json");
      assert.ok(seeded["beta-plugin"].toolPatterns.includes("beta-db"), "Should index beta-db from mcp_config.json");

      // 2. Trim uninstalled component
      const trimmed = trimMiddlewareIntent(sb.hub, "alpha-plugin");
      assert.equal(trimmed, true, "trimMiddlewareIntent should return true for removed plugin");

      const updatedRaw = fs.readFileSync(intentsPath, "utf8");
      const updated = JSON.parse(updatedRaw);
      assert.equal(updated["alpha-plugin"], undefined, "alpha-plugin must be pruned from middleware-intents.json");
      assert.ok(updated["beta-plugin"], "beta-plugin must be preserved");
    } finally {
      sb.cleanup();
    }
  });
});
