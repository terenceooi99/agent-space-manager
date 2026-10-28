// tests/detect.test.mjs
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { makeSandbox } from "./helpers.mjs";

describe("Feature 7: Multi-Agent Config Path Detection & Name Inference", () => {
  test("detectAgentConfigPath resolves distinct native skill/bundle paths for all 13 profiles", async () => {
    const sb = makeSandbox();
    try {
      const m = await import("../manager.mjs");
      assert.match(m.detectAgentConfigPath("Antigravity"), /\.gemini[\\/]config[\\/]plugins$/);
      assert.match(m.detectAgentConfigPath("Gemini CLI"), /\.gemini[\\/]skills$/);
      assert.match(m.detectAgentConfigPath("Claude Code"), /\.claude[\\/]skills$/);
      assert.match(m.detectAgentConfigPath("Codex CLI"), /\.codex[\\/]skills$/);
      assert.match(m.detectAgentConfigPath("OpenCode"), /\.config[\\/]opencode[\\/]skills$/);
      assert.match(m.detectAgentConfigPath("Cursor"), /\.cursor[\\/]skills$/);
      assert.match(m.detectAgentConfigPath("Windsurf"), /\.codeium[\\/]windsurf[\\/]skills$/);
      assert.match(m.detectAgentConfigPath("VS Code Copilot"), /\.copilot[\\/]skills$/);
      assert.match(m.detectAgentConfigPath("Cline"), /\.cline[\\/]skills$/);
      assert.match(m.detectAgentConfigPath("Roo Code"), /\.roo[\\/]skills$/);
      assert.match(m.detectAgentConfigPath("Kiro"), /\.kiro[\\/]skills$/);
    } finally {
      sb.cleanup();
    }
  });

  test("inferNameFromExe avoids substring collisions (opencode vs code, claude vs cline)", async () => {
    const sb = makeSandbox();
    try {
      const m = await import("../manager.mjs");
      assert.equal(m.inferNameFromExe("C:\\Programs\\OpenCode.exe"), "OpenCode");
      assert.equal(m.inferNameFromExe("C:\\Programs\\Code.exe"), "VS Code");
      assert.equal(m.inferNameFromExe("C:\\Programs\\Cursor.exe"), "Cursor");
      assert.equal(m.inferNameFromExe("C:\\Users\\x\\.gemini\\bin\\agy.cmd"), "Antigravity");
      assert.equal(m.inferNameFromExe("/usr/local/bin/codex"), "Codex CLI");
    } finally {
      sb.cleanup();
    }
  });
});
