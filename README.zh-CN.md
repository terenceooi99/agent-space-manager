# 智能中间件与 Agent Space Manager

**面向 [Magpie](https://usemagpie.ai) 的通用多 IDE 与项目技能编排器，内置基于意图的动态工具网关**。

[English](README.md) | [简体中文](README.zh-CN.md)

---

## 核心定位与设计初衷

随着开发者在日常工作中同时采用多个 AI 编码环境（如 Antigravity、Cursor、Windsurf、Claude Code、OpenCode、VS Code Copilot 等），技能 (Skills)、规则 (Rules) 以及 MCP 服务配置往往被分散割裂在各个 IDE 专属的配置目录中。在数十个项目代码仓库与工具链之间手动管理、更新和同步这些资产，极易引发混乱且难以维护。

**Agent Space Manager 正是为此而生，作为整个 AI 开发生态的单一集中控制平面：**

1. **单一数据事实来源（中央 Hub）**：将所有插件、技能、MCP 配置、Hooks、Agent 模板和规则统一存放在一个集中目录（Components Storage Path / Hub 根目录），彻底消除在不同 IDE 配置文件夹中重复拷贝和重复安装的问题。
2. **跨 IDE 动态分发机制**：自动通过操作系统级非破坏性链接（Windows 下的 NTFS 目录联接 Junction，macOS/Linux 下的软链接 symlink），直接挂载到各个 IDE 的原生加载路径中（例如 `~/.gemini/config/plugins`、`~/.cursor/skills`、`~/.claude/skills`）。
3. **即时 IDE 同步与智能解绑（Auto-Unlinking）**：
   - 切换存储路径时，所有已连接的 IDE 将立即重新指向新位置。
   - 若设置的存储路径中包含 0 个组件，系统将自动切断所有挂载链接，干净且无残留地从已连接的 IDE 中移除。
   - 停用某个组件时，会即时解除对应链接，绝不删除源文件。
4. **精细化项目与工作区覆盖（Overrides）**：仅在特定代码仓库中启用该项目所需的技能和 MCP 服务，同时为其余工作区保持整洁全局默认配置。
5. **智能中间件工具网关（Smart Middleware）**：通过在每个对话轮次中动态计算意图并筛选活跃工具架构，防止大模型上下文溢出以及因超出模型工具数上限而引发的 API `400` 报错（例如 Claude/GPT 系列模型单次最多支持 128 个工具）。

---

## 核心功能特性

- **零硬编码的多平台支持**：完美适配 Windows、macOS 和 Linux，不硬编码任何用户主目录路径或盘符。
- **动态配置链接自动发现**：通过探测文件系统、读取环境变量（`$AGENT_TOOLS_ROOT`、`$AI_WORKSPACE_DIR`）以及调用 IDE CLI（如 `opencode debug paths` 等），精准识别各 IDE 的插件与技能链接目录。
- **细粒度多 IDE 与项目级管控**：支持针对特定 IDE 或代码仓库单独开关技能、MCP 服务与规则。未单独配置的项目将自动继承全局统一默认设置。
- **安全的 Junction 生命周期管控**：创建与断开均采用安全的原生目录联接/软链接；移除 IDE 或项目时仅断开链接，绝不触碰 `plugins/` 内的源文件。
- **网关模型限制防护**：在每轮对话中智能裁剪并优化工具 Schema（默认最多保留 96 个安全工具），彻底根除 API 400 超限报错，在 UI 界面中支持一键开关切换。

---

## 架构与数据流

```text
[ Magpie 宿主环境 (Bun / WebView2) ]
        │
        ├── IPC 通信: globalThis.magpie.api (getPlugins, saveConfig 等)
        └── HTTP / REST 备用链路: http://127.0.0.1:41789/api/* (server.mjs)
                    │
                    ▼
        [ manager.mjs 核心引擎 ]
        ├── scanPlugins(hubRoot)
        ├── buildCategoriesRegistry(plugins, hubRoot)
        └── syncIdePlugins(ide, allPlugins) ──> 创建/移除 Junction 联接
```

1. **宿主入口 (`index.mjs`)**：将插件挂载进 Magpie 运行时，暴露 IPC 接口方法，同时启动后台 `server.mjs` 服务。
2. **核心业务引擎 (`manager.mjs`)**：
   - `scanPlugins(hubRoot)`：扫描 `<hubRoot>/plugins` 目录下（或根目录直放插件）的所有插件。
   - `syncIdePlugins(ide, allPlugins)`：对比 `ide.configPath` 下现有的 Junction 链接与当前启用的插件列表，自动清除废弃/禁用的链接，并挂载最新启用的组件。
3. **Web 前端界面 (`page/index.html`, `page/app.js`, `page/style.css`)**：
   - 运行在 WebView2 环境中，通过 `apiClient.getPlugins(targetPath)` 获取组件数据。
   - 渲染 IDE 列表、项目覆盖配置、插件管理表格及已发现组件分类视图。
   - 针对路径变更或开关切换提供防抖自动保存与同步（`triggerAutoSync()` -> `persistConfig()`）。

---

## 支持的 IDE 与多 Agent 原生适配矩阵

除 Antigravity 原生支持读取 `plugins/<plugin>/plugin.json` 插件包之外，大多数主流 AI 编码 Agent 无法直接解析插件包结构，而是要求独立的 `<skill>/SKILL.md` 目录、原生 JSON/TOML 格式的 MCP 服务配置以及 Markdown 规则块。

**Agent Space Manager v1.2+ 内置了 13 种 Agent 预设配置（`agents.mjs` 与 `adapters.mjs`），可自动将组件转换并分发为各 Agent 的原生格式：**

| Agent 配置文件 (`agentType`) | 适配模式 | Skills 目标目录 | MCP 服务目标配置 | 规则 / 指令目标文件 | Subagents 模板目标目录 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Antigravity (`antigravity`)** | `bundle` | `~/.gemini/config/plugins/<id>` | 插件包内 (`mcp_config.json`) | 插件包内 (`rules/*.md`) | 插件包内 (`agents/*.md`) |
| **Claude Code (`claude-code`)** | `convert` | `~/.claude/skills/<skill>` | `~/.claude.json` (`mcpServers`) | `~/.claude/CLAUDE.md` (`@path` 隔离块) | `~/.claude/agents/*.md` |
| **Codex CLI (`codex`)** | `convert` | `~/.codex/skills/<skill>` | `~/.codex/config.toml` (`[mcp_servers.*]`) | `~/.codex/AGENTS.md` (托管隔离块) | — |
| **OpenCode (`opencode`)** | `convert` | `~/.config/opencode/skills/<skill>` | `~/.config/opencode/opencode.json` (`mcp`) | `~/.config/opencode/AGENTS.md` | `~/.config/opencode/agents/*.md` |
| **VS Code / Copilot (`vscode-copilot`)** | `convert` | `~/.copilot/skills/<skill>` | `<AppData>/Code/User/mcp.json` (`servers`) | `Code/User/prompts/*.instructions.md` | `Code/User/prompts/*.agent.md` |
| **Cursor AI (`cursor`)** | `convert` | `~/.cursor/skills/<skill>` | `~/.cursor/mcp.json` (`mcpServers`) | 工作区 `.cursor/rules` | — |
| **Windsurf (`windsurf`)** | `convert` | `~/.codeium/windsurf/skills/<skill>` | `~/.codeium/windsurf/mcp_config.json` | `~/.codeium/windsurf/memories/global_rules.md` | — |
| **Gemini CLI (`gemini-cli`)** | `convert` | `~/.gemini/skills/<skill>` | `~/.gemini/settings.json` (`mcpServers`) | `~/.gemini/GEMINI.md` | — |
| **Cline (`cline`)** | `convert` | `~/.cline/skills/<skill>` | `globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json` | `~/Documents/Cline/Rules/*.md` | — |
| **Roo Code (`roo-code`)** | `convert` | `~/.roo/skills/<skill>` | `globalStorage/rooveterinaryinc.roo-cline/settings/mcp_settings.json` | `~/.roo/rules/*.md` | — |
| **Kiro (`kiro`)** | `convert` | `~/.kiro/skills/<skill>` | `~/.kiro/settings/mcp.json` | `~/.kiro/steering/*.md` | — |
| **Universal (`agents-universal`)** | `convert` | `~/.agents/skills/<skill>` | — | — | — |
| **Custom (`custom`)** | `convert` | `<custom-dir>/<skill>` | — | — | — |

---

## 非破坏性归属清单与备份保障机制

- **归属状态追踪 (`~/.agent-space-manager/state/<id>.json`)**：完整记录由 Agent Space Manager 创建的每一个 Junction 联接、复制的文件、JSON 键以及 Markdown/TOML 托管块。
- **零误删安全承诺**：
  - `createJunction` 若检测到目标路径存在真实、用户自有文件或目录，将严格拒绝删除，避免误伤。
  - `syncIdePlugins` 仅清理归属清单中明确记录的项（或指向 Hub 内部的旧版本 Junction），用户自行创建的软链接或手动编写的 MCP 服务将受到完整保护。
  - 在修改任何现有用户配置文件（如 `~/.claude.json`、`~/.codex/config.toml`、`opencode.json`、`mcp.json`、`CLAUDE.md`、`AGENTS.md`）之前，系统会自动生成 `.asm-bak` 备份文件。
- **细粒度项目覆盖目录与 Git 保护**：项目覆盖配置将直接同步至代码仓库的原生 Agent 目录（如 `<repo>/.claude/skills`、`<repo>/.cursor/skills`、`<repo>/.agents/skills`），并自动把托管路径加入 `<repo>/.git/info/exclude`，确保链接绝不会被意外提交进 Git 版本库。

---

## 自动化测试套件

运行完整的沙箱化测试套件（覆盖 10 个测试套件，在隔离的临时 `HOME` 环境下运行）：

```bash
npm test
npm run test:report
```

---

## 标准插件目录规范

Components Storage 存储路径中的所有组件均遵循标准自包含插件规范：

```text
plugins/<plugin-name>/
├── plugin.json       # 必需清单文件 (name, version, description, upstream)
├── mcp_config.json   # 可选 MCP 服务定义
├── hooks.json        # 可选生命周期 Hooks 定义
├── skills/           # 可选 Skills 技能目录 (<skill-name>/SKILL.md)
├── agents/           # 可选 Subagent 智能体模板 (<agent-name>.md)
└── rules/            # 可选规则指令目录 (<rule-name>.md)
```

---

## 支持与赞助

如果 Agent Space Manager 对您的日常开发工作流有所帮助，欢迎通过以下渠道支持开发：
- [Wise - Terence Ooi Teng Wei @terenceooit](https://wise.com/pay/me/terenceooit)

---

## 开源协议

MIT © Terence Ooi

