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
});
