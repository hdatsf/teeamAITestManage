# TeamAI Control Plane

团队 AI 技能的**管理端**：集中发布技能，观察被管理项目的同步状态，以及团队成员在项目中的使用情况。

配套被管理项目：[`hdatsf/hdatsfTeamAITest`](https://github.com/hdatsf/hdatsfTeamAITest)

## 功能

- **技能库**：发布 `SKILL.md`，自动递增版本、生成 SHA-256，支持在页面编辑并发布新版本。
- **多项目分发**：被管理项目用零依赖插件 `teamai sync` 拉取最新技能，只更新变化的文件。
- **同步健康度**：看板展示每个项目的最近同步、已安装技能数、落后版本、参与成员。
- **使用洞察**：按成员、项目、技能聚合调用次数，展示 30 天趋势与实时流水。
- **开箱即用演示数据**：内置 4 个技能、4 个项目（含被管理项目）、多名成员近两周的同步与使用记录。

## 架构

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│  teamAITestManage           │        │  hdatsfTeamAITest            │
│                             │        │                              │
│  packages/web  ── 看板      │        │  .teamai/bin/teamai.mjs      │
│  packages/server ── API     │◀──────▶│  .teamai/skills/*/SKILL.md   │
│  packages/plugin ── 分发     │  HTTP  │  .teamai/lock.json           │
│  skills/       ── 技能源     │        │                              │
│  data/teamai.db ── SQLite   │        │  npm run teamai:sync         │
└─────────────────────────────┘        └──────────────────────────────┘
         ▲                                          │
         └──────────── 同步 / 使用事件上报 ──────────┘
```

- 管理端提供技能发布、插件下载、事件接收和统计 API。
- 插件是单个零依赖 ESM 文件，可被下载到任何 Node 18+ 项目。
- 数据默认落在 `data/teamai.db`（SQLite，首次启动自动建表并播种演示数据）。

## 快速开始

要求 Node.js **22.12+**（服务端使用内置 `node:sqlite`）。

```bash
npm install
npm run dev
```

> Windows 上如果 Vite 报 `Cannot find module @rollup/rollup-win32-x64-msvc`，通常是 npm 的全局
> `.npmrc` 里设置了 `os=linux`。在本项目根目录新建 `.npmrc`（已加入 `.gitignore`，不会提交）：
>
> ```ini
> os=win32
> cpu=x64
> ```
>
> 然后重新 `npm install`；只想装一次也可以 `npm install --os=win32 --cpu=x64`。

- 看板：<http://127.0.0.1:5173>
- API：<http://127.0.0.1:4310>

首次启动会生成演示数据：`alice` / `bob` / `carol` / `david` 的历史同步与技能调用。

### 生产模式

```bash
npm run build
npm start
# 打开 http://127.0.0.1:4310，由 API 服务托管构建后的前端
```

## 端到端演示

1. 管理端 `npm run dev`，打开看板确认已有历史使用数据。
2. 在被管理项目 `hdatsfTeamAITest` 执行：
   ```bash
   npm run teamai:install
   npm run teamai:sync
   npm run teamai:track -- --skill code-review --action "评审了示例代码"
   ```
3. 看板「项目」出现 `hdatsfTeamAITest`，状态「已同步」；「使用情况」出现当前系统用户。
4. 在看板「技能库」点击任意技能 →「发布新版本」，修改正文后发布。
5. 回到被管理项目执行 `npm run teamai:sync`，再打开 `npm run teamai:status`，版本已更新。
6. 管理端项目详情中可看到新版本与落后项消失。

模拟其他团队成员（会真实调用插件同步并写入使用事件）：

```bash
npm run simulate
```

重置演示数据：

```bash
npm run reset
```

## 目录结构

```
teamAITestManage/
├── packages/
│   ├── plugin/        # 零依赖 TeamAI 客户端（被管理项目分发）
│   ├── server/        # Express API + SQLite + 种子数据
│   └── web/           # React + Vite 看板
├── skills/            # 演示技能源（首次启动播种）
├── scripts/
│   ├── dev.mjs        # 同时启动 API 与 Vite
│   ├── simulate-teammates.mjs
│   └── reset-demo.mjs
└── data/              # 运行时数据库（gitignore）
```

## 演示账号与令牌

| 用途 | 默认值 | 环境变量 |
| --- | --- | --- |
| 管理端写操作 | `teamai-admin-local` | `TEAMAI_ADMIN_TOKEN` |
| 项目接入/事件上报 | `teamai-demo-token` | `TEAMAI_INGEST_TOKEN` |
| 服务端口 | `4310` | `PORT` / `TEAMAI_PORT` |
| 监听地址 | `127.0.0.1` | `TEAMAI_HOST` |
| 数据目录 | `./data` | `TEAMAI_DATA_DIR` |

看板写操作会从 `VITE_TEAMAI_ADMIN_TOKEN`（默认 `teamai-admin-local`）读取管理令牌。

> 这是本地演示配置。生产环境请替换两个令牌、启用 HTTPS，并在反向代理层增加身份认证。

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/v1/health` | 健康检查与插件版本 |
| GET | `/api/v1/overview?days=14` | 看板总览、趋势、项目健康度 |
| GET | `/api/v1/skills` | 技能列表（含同步所需内容与 SHA-256） |
| GET | `/api/v1/skills/:slug` | 技能详情与版本历史 |
| POST | `/api/v1/skills` | 发布技能/新版本（管理令牌） |
| GET | `/api/v1/projects` | 项目列表与同步状态 |
| GET | `/api/v1/projects/:id` | 项目已安装技能与最近事件 |
| POST | `/api/v1/projects/register` | 项目注册（接入令牌） |
| POST | `/api/v1/events` | 批量上报同步/使用事件（接入令牌） |
| GET | `/api/v1/usage?days=30` | 成员、技能、项目维度聚合 |
| GET | `/api/v1/activity?limit=40` | 最近事件流水 |
| GET | `/api/v1/plugin/teamai.mjs` | 下载插件 |
| GET | `/api/v1/plugin/meta` | 插件版本与校验和 |

请求示例：

```bash
curl -X POST http://127.0.0.1:4310/api/v1/skills \
  -H "content-type: application/json" \
  -H "x-teamai-admin: teamai-admin-local" \
  -d '{"slug":"code-review","name":"Code Review","description":"…","tags":["review"],"body":"# Code Review\n\n…"}'

curl http://127.0.0.1:4310/api/v1/usage?days=30
```

## 数据表

- `projects` — 受管项目
- `skills` / `skill_versions` — 技能元数据与版本（正文、SHA-256、发布者）
- `project_skills` — 每次同步上报的版本快照，用于计算落后项
- `events` — `sync`、`skill.invoked`、`skill.published` 等事件

## 开发命令

```bash
npm run dev          # API + Web 同时启动
npm run dev:server   # 仅 API（tsx watch）
npm run dev:web      # 仅 Vite
npm run build        # 构建前端与服务端
npm start            # 生产启动
npm run simulate     # 模拟其他团队成员
npm run reset        # 清空运行时数据
```

## 说明与边界

- 演示数据在首次启动时播种；`npm run reset` 后重启即可恢复。
- 这是可运行的 MVP：令牌校验、事件限流、多租户与审计日志属于生产化改造项。
- 技能文件格式为 `SKILL.md`（YAML frontmatter + Markdown 正文），与常见 AI 技能目录约定兼容。
