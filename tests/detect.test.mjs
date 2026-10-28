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

  test("killAgentProcesses protects all GUI editors from process termination", async () => {
    const sb = makeSandbox();
    try {
      const m = await import("../manager.mjs");
      const guiAgents = ["antigravity", "cursor", "windsurf", "vscode", "opencode", "kiro"];
      for (const agentType of guiAgents) {
        const res = m.killAgentProcesses({ agentType, exePath: `C:\\Programs\\${agentType}.exe` });
        assert.equal(res.success, true);
        assert.ok(res.skipped);
      }
    } finally {
      sb.cleanup();
    }
  });

  test("sanitizeAgentConfigDirectory prunes corrupted empty project manifests and ghost folders", async () => {
    const sb = makeSandbox();
    try {
      const m = await import("../manager.mjs");
      const fs = await import("node:fs");
      const path = await import("node:path");

      const cfgDir = path.join(sb.home, ".gemini", "config");
      const projDir = path.join(cfgDir, "projects");
      const pluginsDir = path.join(cfgDir, "plugins");
      fs.mkdirSync(projDir, { recursive: true });
      fs.mkdirSync(pluginsDir, { recursive: true });

      // Create corrupted stubs
      fs.writeFileSync(path.join(projDir, "corrupted-empty.json"), "{}\n", "utf8");
      fs.writeFileSync(path.join(projDir, "zero-byte.json"), "", "utf8");
      fs.writeFileSync(path.join(projDir, "valid-project.json"), JSON.stringify({ id: "valid-1", name: "Valid" }), "utf8");
      fs.mkdirSync(path.join(pluginsDir, "empty-ghost-dir"), { recursive: true });

      m.sanitizeAgentConfigDirectory(cfgDir, "antigravity");

      assert.equal(fs.existsSync(path.join(projDir, "corrupted-empty.json")), false, "Must delete empty {} project");
      assert.equal(fs.existsSync(path.join(projDir, "zero-byte.json")), false, "Must delete 0-byte project");
      assert.equal(fs.existsSync(path.join(projDir, "valid-project.json")), true, "Must keep valid project with id");
      assert.equal(fs.existsSync(path.join(pluginsDir, "empty-ghost-dir")), false, "Must prune empty ghost folder");
    } finally {
      sb.cleanup();
    }
  });
});
