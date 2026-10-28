// tests/helpers.mjs
// Sandboxed test fixture generator for Agent Space Manager.
// Overrides HOME / USERPROFILE / APPDATA / LOCALAPPDATA / AGENT_TOOLS_ROOT in a temp directory
// so zero tests ever touch the user's real home or real hub directory.

process.env.ASM_TEST = "1";
process.env.NODE_ENV = "test";

import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export function makeSandbox(prefix = "asm-test-") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const home = path.join(root, "home");
  const appData = path.join(home, "AppData", "Roaming");
  const localAppData = path.join(home, "AppData", "Local");
  const hub = path.join(root, "hub");
  const cacheDir = path.join(root, "cache");
  const repo = path.join(root, "sample-repo");

  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(appData, { recursive: true });
  fs.mkdirSync(localAppData, { recursive: true });
  fs.mkdirSync(hub, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.mkdirSync(path.join(repo, ".git", "info"), { recursive: true });
  fs.writeFileSync(path.join(repo, ".git", "info", "exclude"), "# git exclude\n", "utf8");

  // Populate fixture hub with:
  // 1) alpha-plugin: full bundle (2 skills, 2 MCP servers, 1 rule, 1 agent, hooks.json)
  const alpha = path.join(hub, "plugins", "alpha-plugin");
  fs.mkdirSync(path.join(alpha, "skills", "code-review"), { recursive: true });
  fs.writeFileSync(
    path.join(alpha, "skills", "code-review", "SKILL.md"),
    "---\nname: code-review\ndescription: Perform thorough code review\n---\n# Code Review Skill\n",
    "utf8"
  );
  fs.mkdirSync(path.join(alpha, "skills", "security-audit"), { recursive: true });
  fs.writeFileSync(
    path.join(alpha, "skills", "security-audit", "SKILL.md"),
    "---\nname: security-audit\ndescription: Audit code for vulnerabilities\n---\n# Security Audit\n",
    "utf8"
  );
  fs.mkdirSync(path.join(alpha, "rules"), { recursive: true });
  fs.writeFileSync(path.join(alpha, "rules", "alpha-style.md"), "# Alpha Rule\nAlways write clean code.\n", "utf8");
  fs.mkdirSync(path.join(alpha, "agents"), { recursive: true });
  fs.writeFileSync(path.join(alpha, "agents", "reviewer.md"), "# Reviewer Subagent\nReviews PRs.\n", "utf8");
  fs.writeFileSync(
    path.join(alpha, "plugin.json"),
    JSON.stringify({ name: "Alpha Suite", version: "1.2.0", description: "Core review & security bundle" }, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(alpha, "mcp_config.json"),
    JSON.stringify(
      {
        mcpServers: {
          "alpha-mcp": { command: "npx", args: ["-y", "@alpha/mcp-server"], env: { ALPHA_KEY: "123" } },
          "alpha-http": { url: "https://mcp.alpha.example/sse" },
        },
      },
      null,
      2
    ),
    "utf8"
  );
  fs.writeFileSync(
    path.join(alpha, "hooks.json"),
    JSON.stringify({ hooks: { PreToolUse: [{ command: "echo pre" }] } }, null, 2),
    "utf8"
  );

  // 2) beta-plugin: 1 skill + 1 MCP + 1 rule (also has duplicate skill name "code-review" for clash testing if needed)
  const beta = path.join(hub, "plugins", "beta-plugin");
  fs.mkdirSync(path.join(beta, "skills", "deploy-helper"), { recursive: true });
  fs.writeFileSync(
    path.join(beta, "skills", "deploy-helper", "SKILL.md"),
    "---\nname: deploy-helper\ndescription: Deploy helper skill\n---\n# Deploy Helper\n",
    "utf8"
  );
  fs.mkdirSync(path.join(beta, "rules"), { recursive: true });
  fs.writeFileSync(path.join(beta, "rules", "beta-ops.md"), "# Beta Ops Rule\nCheck staging first.\n", "utf8");
  fs.writeFileSync(
    path.join(beta, "plugin.json"),
    JSON.stringify({ name: "Beta Ops", version: "0.9.0", description: "Deployment tools" }, null, 2),
    "utf8"
  );
  fs.writeFileSync(
    path.join(beta, "mcp_config.json"),
    JSON.stringify({ mcpServers: { "beta-db": { command: "uvx", args: ["mcp-sqlite", "--db", "test.db"] } } }, null, 2),
    "utf8"
  );

  // 3) broken-manifest-plugin: invalid plugin.json but valid skills folder
  const broken = path.join(hub, "plugins", "broken-plugin");
  fs.mkdirSync(path.join(broken, "skills", "fallback-skill"), { recursive: true });
  fs.writeFileSync(path.join(broken, "skills", "fallback-skill", "SKILL.md"), "---\nname: fallback-skill\n---\n", "utf8");
  fs.writeFileSync(path.join(broken, "plugin.json"), "{ invalid json ", "utf8");

  // 4) empty-dir: should be ignored by scanPlugins
  fs.mkdirSync(path.join(hub, "plugins", "empty-folder"), { recursive: true });

  // 5) root standalone skills, rules, agents
  fs.mkdirSync(path.join(hub, "skills", "standalone-skill"), { recursive: true });
  fs.writeFileSync(path.join(hub, "skills", "standalone-skill", "SKILL.md"), "---\nname: standalone-skill\n---\n", "utf8");
  fs.mkdirSync(path.join(hub, "rules"), { recursive: true });
  fs.writeFileSync(path.join(hub, "rules", "root-rule.md"), "# Root Rule\n", "utf8");
  fs.mkdirSync(path.join(hub, "agents"), { recursive: true });
  fs.writeFileSync(path.join(hub, "agents", "root-agent.md"), "# Root Agent\n", "utf8");

  const prevEnv = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    APPDATA: process.env.APPDATA,
    LOCALAPPDATA: process.env.LOCALAPPDATA,
    AGENT_TOOLS_ROOT: process.env.AGENT_TOOLS_ROOT,
    ASM_NO_SERVER: process.env.ASM_NO_SERVER,
    ASM_CACHE_DIR: process.env.ASM_CACHE_DIR,
    ASM_HOME_OVERRIDE: process.env.ASM_HOME_OVERRIDE,
  };

  process.env.HOME = home;
  process.env.USERPROFILE = home;
  process.env.APPDATA = appData;
  process.env.LOCALAPPDATA = localAppData;
  process.env.AGENT_TOOLS_ROOT = hub;
  process.env.ASM_NO_SERVER = "1";
  process.env.ASM_CACHE_DIR = cacheDir;
  process.env.ASM_HOME_OVERRIDE = home;

  function cleanup() {
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {}
  }

  return { root, home, appData, localAppData, hub, cacheDir, repo, cleanup };
}
