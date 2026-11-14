# 智能中间件与 Agent Space Manager

**面向 [Magpie](https://usemagpie.ai) 的通用多 IDE 与多 Agent 组件编排器，内置基于意图的动态工具网关**。

[English](README.md) | [简体中文](README.zh-CN.md)

---

## 核心定位与设计理念

Agent Space Manager 是一个集中式控制平面，旨在**在同一个文件夹中统一管理所有类型的 AI 组件**——包括 **Plugins（插件）、MCP Servers（MCP 服务）、Hooks（钩子）、Skills（技能）、Subagents（子智能体）与 Rules（规则）**，并支持**连接任意 AI 编码 Agent 或项目代码仓库**，让已启用的组件**直接被已连接的 Agent 识别与使用，而无需将文件重复复制到各个 Agent 的默认配置目录中**。

当开发者同时使用多个 AI 编码环境（Antigravity、Claude Code、Codex CLI、OpenCode、VS Code Copilot、Cursor、Windsurf、Gemini CLI、Cline、Roo Code、Kiro）时，组件文件往往会被重复拷贝并分散在数十个互不兼容的配置目录中。Agent Space Manager 彻底解决了这一痛点：

1. **单一文件夹统一管理（唯一事实来源）**：将所有插件、MCP 配置、Hooks、技能、子智能体模板和规则统一存放在一个 **Components Storage Path**（Hub 根目录，默认为 `~/AI-Agent-Space`）。
2. **零文件重复复制到 Agent 默认配置**：向已连接的 Agent 分发组件时，通过**非破坏性操作系统链接**（Windows 下为 NTFS 目录联接 Junction，macOS/Linux 下为软链接 Symlink）直接指向中央存储目录，绝不将整个组件仓库重复拷贝到各个 Agent 的默认配置文件夹。对于 Windows 上受 Go `os.ReadDir` 机制限制的运行时（如 Antigravity）或要求单文件格式的 Agent（如 MCP JSON/TOML、`CLAUDE.md`、`AGENTS.md`），系统仅生成带有 `.asm-owned.json` 归属标记的轻量目录（子目录仍使用 Junction 联接）或受控分隔块。
3. **按需启用、即时可用**：支持按单个已连接 Agent（全局）或按具体项目仓库（覆盖）开关组件。启用后即可通过热重载立即在目标 Agent 中使用；停用后即时解除链接，绝不删除中央存储中的源文件。

---

## 插件功能详解

### 1. 集中式组件存储与通用自动发现
- **通用路径解析 (`Components Storage Path`)**：支持指向完整的多插件 Hub（`<hub>/plugins/<name>`）、独立 Skills 文件夹、单个插件目录，或留空自动使用默认 Hub（`~/AI-Agent-Space`）。自动兼容带引号的路径与末尾斜杠。
- **可展开的已发现组件注册表 (`Discovered Components Registry`)**：点击 **Expand Components List**，即可按 **7 个分类标签页**（`All`、`Plugins`、`MCPs`、`Hooks`、`Skills`、`Agents`、`Rules`）浏览所有已发现组件，并支持按名称、技能、MCP 或文件路径实时搜索过滤。
- **实时统计磁贴**：直观展示 6 类组件的数量统计，以及**已连接 IDE（Connected IDEs）**和**已注册项目（Registered Projects）**数量。

### 2. 多 Agent 连接、自动探测与原生格式适配
内置 **13 种主流 Agent 预设配置**（`agents.mjs` & `adapters.mjs`）以及 **Custom 自定义 Agent** 支持：
- **配置链接目录自动探测 (`Auto-detect`)**：开启后可自动探测文件系统、可执行文件/快捷方式（`.exe` / `.lnk`）、环境变量（`$AGENT_TOOLS_ROOT`、`$AI_WORKSPACE_DIR`）以及 IDE CLI 工具（如 `opencode debug paths`），精准定位目标 Agent 的原生配置路径。
- **组件目标路径自定义覆盖 (`Component Target Paths`)**：在添加/编辑 IDE 弹窗中可展开自定义各类组件的目标路径：
  - Bundle Path（Antigravity 插件包目录）
  - Skills Directory（技能目录）
  - Slash Commands Directory（`/` 斜杠快捷指令目录）
  - MCP Configuration File（MCP 配置文件）
  - Rules File or Folder（规则文件或目录）
  - Subagents Directory（`@` 提及子智能体目录）
  - Hooks Configuration File（Hooks 配置文件）
- **跨 Agent 原生格式自动转换**：无需手动修改源文件，自动适配各 Agent 的原生规范：
  - **MCP 架构归一化**：自动适配不同根键与结构（Claude/Cursor/Windsurf/Gemini/Cline/Roo/Kiro 使用 `mcpServers`；VS Code Copilot 使用 `servers`；OpenCode 转换为包含 `type: "local" | "remote"` 与 `environment` 的 `mcp` 结构；Codex CLI 写入 `[mcp_servers.*]` TOML 托管块）。
  - **规则元数据与分隔块**：为 Antigravity Cortex 规则自动补全 `trigger: always_on` YAML Frontmatter，为 Cursor 生成 `.mdc` 规则，为 `CLAUDE.md`、`AGENTS.md`、`GEMINI.md`、`global_rules.md` 写入带边界注释的托管块（`<!-- agent-space-manager:start -->` / `# >>> agent-space-manager`）。
  - **OpenCode 子智能体校验**：自动为 `.opencode/agents/*.md` 补全 `mode: subagent` 字段。

### 3. 按 Agent 与项目仓库的细粒度开关矩阵与实时状态
- **已连接 IDE 与项目仓库管理**：
  - 支持拖拽排序（第 1 个 IDE 作为默认存储回退目标）。
  - **Clone / Fork Project**：一键克隆项目配置，快速将同一代码仓库关联到另一个 IDE。
  - **项目级覆盖与 Git 保护**：为特定仓库单独启用/禁用组件（未注册项目自动继承全局设置）。项目内的托管链接路径会自动写入 `<repo>/.git/info/exclude`，防止被误提交到 Git。
- **组件矩阵 (`Components & Plugins`)**：
  - 按当前选中的 IDE（全局）或项目仓库切换 **Active** 开关，支持 **Expand All Files** 展开查看组件内所有文件树，支持 **Rescan Hub** 与 **Connect** 一键同步。
  - **Hub 重扫与实时链接进度弹窗**：展示扫描进度条及每个已连接 IDE / 仓库的实时链接状态卡片。
  - **可用性状态指示灯 (`● Agent Status`) 与快捷指令识别**：通过绿色（`🟢` 可用）/ 红色（`🔴` 连接异常）状态点校验磁盘物理就绪状态，并自动识别已启用组件提供的 `/` 斜杠指令与 `@` 提及；支持在后台运行状态检查进度弹窗。

### 4. 外部（Foreign）组件检测与清理
- **外部未托管组件扫描**：自动检测已连接 Agent 默认配置目录中非源自 Components Storage Path 的外部组件（`/api/agent/scan-foreign`）。
- **交互式清理弹窗**：列出检测到的外部组件，支持选择 **Cancel / Keep Existing（保留现有）** 或 **Delete Foreign Components（删除外部组件）**（`/api/agent/clean-foreign`），确保 Agent 环境与中央 Hub 保持一致。

### 5. 启动变更指纹检测与自动重连
- **SHA-256 存储快照指纹**：对 Components Storage 目录计算确定性规范快照（`getComponentsStorageSnapshot`）。
- **外部变更自动重连**：启动时若检测到存储目录中存在外部新增、修改或删除，系统将自动重新同步已配置的 Agent，并在顶部展示可关闭的 **Auto-reconnected Connected Agents** 提示横幅。

### 6. 集中式每周上游更新检查与规范提示词 (`Copy Prompt V1.5`)
- **集中式每周一更新检查**：每周一启动 Magpie 时集中检查所有已安装组件的上游仓库更新（`/api/central-update-check`），并自动清理分散的本地更新脚本（`update_checker.mjs`、`update_check_state.json`）。
- **一键复制规范提示词 (`Copy Prompt (V1.5)`)**：在 **Storage & Upstream Rules** 磁贴中一键复制标准化指令，引导你的 AI 助手严格遵守 Hub 目录规范、记录 `upstream` 上游链接、执行完整的插件卸载清理（同步裁剪智能中间件无用意图）、使用无 BOM 的 UTF-8 编码、保持一次性目录整理稳定性、保护 `shared/` 跨 Agent 通信目录，并在 `shared/middleware-intents.json` 中自动生成初始意图并在组件变动时动态增删。

### 7. 智能中间件工具网关与 OmniRoute 集成
- **基于意图的动态工具过滤 (`smart-tools.middleware.js`)**：
  - 挂载于 Magpie 的 `onRequest` / `onResponse` 生命周期，防止因超出模型工具上限（例如 Claude/GPT 系列的 128 个工具限制）导致上下文溢出或 API `400` 报错。
  - 始终保留核心文件、终端与网络工具，并根据近期对话内容匹配相关领域工具，裁剪其余工具。
  - **UI 控制**：支持顶部栏一键切换 **Smart Middleware: Active / Bypassed**，并在 **Gateway Tool Optimization** 磁贴中自定义工具上限（`10–256`，默认 `96`，支持一键 **Default** 重置）。
  - **故障诊断日志**：异常自动记录至 `error.log`、`LAST_ERROR.json` 与 `STATUS.md`。
- **OmniRoute AI 网关胶囊**：顶部栏集成 OmniRoute 端口显示（`20128`，点击复制）、健康状态灯（绿/红/灰）及启停控制接口（`/api/omniroute/status`、`start`、`stop`、`open`）。

### 8. 非破坏性归属追踪与安全保障机制
- **归属清单追踪 (`.asm-owned.json` 与 `~/.agent-space-manager/state/<id>.json`)**：精确记录由 Agent Space Manager 创建的每一条链接、包装目录、JSON 键与文本托管块。卸载或停用时仅清理归属项，绝不误删用户自建文件、外部软链接或手动配置的 MCP 服务。
- **自动 `.asm-bak` 备份**：修改任何现有用户配置文件（`~/.claude.json`、`~/.codex/config.toml`、`opencode.json`、`mcp.json`、`CLAUDE.md`、`AGENTS.md`）前，自动生成 `.asm-bak` 原始备份。
- **配置目录清理**：自动清除 0 字节 JSON 文件及缺少 `"id"` 字段的空 `{}` 存根，避免 IDE 语言服务器崩溃重启。
- **GUI 编辑器进程保护与 WebView2 兼容性**：绝不强杀正在运行的 GUI 编辑器（`antigravity.exe`、`cursor.exe`、`windsurf.exe`、`code.exe`、`opencode.exe`），完全依赖磁盘热重载；前端破坏性操作全部采用两步内联确认按钮，禁用同步阻塞的 `window.confirm`/`alert`/`prompt`。

---

## 支持的 IDE 与多 Agent 原生适配矩阵

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
| **Custom (`custom`)** | `convert` | `<custom-dir>/<skill>` | 支持自定义路径覆盖 | 支持自定义路径覆盖 | 支持自定义路径覆盖 |

---

## 架构与标准存储目录规范

```text
[ Magpie 宿主环境 (Bun / WebView2) ]
        │
        ├── IPC 通信: globalThis.magpie.api (getPlugins, saveConfig, connectAgent 等)
        └── HTTP / REST 接口: http://127.0.0.1:41789/api/* (server.mjs)
                    │
                    ▼
        [ manager.mjs + adapters.mjs + agents.mjs ]
        ├── scanPlugins(hubRoot) 与 buildCategoriesRegistry()
        ├── 智能中间件 (smart-tools.middleware.js: onRequest / onResponse)
        └── connectAgent / syncAllIdes ──> 操作系统 Junction/Symlink 与原生配置托管块
```

Components Storage 标准目录结构：

```text
<Components Storage Path>/
├── plugins/<plugin-name>/
│   ├── plugin.json       # 必需清单文件 (name, version, description, upstream)
│   ├── mcp_config.json   # 可选 MCP 服务定义
│   ├── hooks.json        # 可选生命周期 Hooks 定义
│   ├── skills/           # 可选 Skills 技能目录 (<skill-name>/SKILL.md)
│   ├── agents/           # 可选 Subagent 智能体模板 (<agent-name>.md)
│   └── rules/            # 可选规则指令目录 (<rule-name>.md)
├── skills/               # 可选独立技能目录
├── shared/               # 跨 Agent IPC、handoff/、_upstream_backups/ 与共享工具目录
├── hub-config.json       # Hub 配置文件
├── plugins.json          # 已发现插件索引
└── skills.json           # 已发现技能索引
```

---

## 自动化测试套件

在隔离的临时 `HOME` 沙箱环境下运行测试套件（`ASM_TEST=1` / `NODE_ENV=test`）：

```bash
npm test
npm run test:report
npm run test:universal
```

---

## 支持与赞助

如果 Agent Space Manager 对您的日常开发工作流有所帮助，欢迎通过以下渠道支持开发：
- [Wise - Terence Ooi Teng Wei @terenceooit](https://wise.com/pay/me/terenceooit)

---

## 开源协议

MIT © Terence Ooi
