// tests/projects.test.mjs
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { makeSandbox } from "./helpers.mjs";

describe("Feature 4: Granular Project & Workspace Overrides", () => {
  test("syncAllIdes applies project-level plugin overrides into the repository workspace and updates .git/info/exclude", async () => {
    const sb = makeSandbox();
    try {
      const m = await import("../manager.mjs");
      const plugins = m.scanPlugins(sb.hub);

      const hubConfig = {
        hubRoot: sb.hub,
        ides: [
          {
            id: "claude-code",
            name: "Claude Code",
            agentType: "claude-code",
            configPath: path.join(sb.home, ".claude", "skills"),
            enabled: true,
            // Globally disable beta-plugin
            plugins: { "alpha-plugin": true, "beta-plugin": false },
          },
        ],
        projects: [
          {
            id: "proj-1",
            name: "Sample Repo",
            ideId: "claude-code",
            repoPath: sb.repo,
            // Override for this repo: enable beta-plugin, disable alpha-plugin
            plugins: { "alpha-plugin": false, "beta-plugin": true },
          },
        ],
      };

      const res = m.syncAllIdes(hubConfig, plugins);
      assert.equal(res.success, true);

      // Repo workspace (.claude/skills) should have beta-plugin's deploy-helper, NOT alpha-plugin's code-review
      const repoSkillBeta = path.join(sb.repo, ".claude", "skills", "deploy-helper", "SKILL.md");
      const repoSkillAlpha = path.join(sb.repo, ".claude", "skills", "code-review", "SKILL.md");
      assert.equal(fs.existsSync(repoSkillBeta), true, "Project-enabled plugin skill must be linked into repo");
      assert.equal(fs.existsSync(repoSkillAlpha), false, "Project-disabled plugin skill must not be in repo");

      // .git/info/exclude should contain .claude/skills so links are not committed
      const excludeText = fs.readFileSync(path.join(sb.repo, ".git", "info", "exclude"), "utf8");
      assert.match(excludeText, /\.claude\/skills/);
    } finally {
      sb.cleanup();
    }
  });
});
