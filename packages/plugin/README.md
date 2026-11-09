# @teamai/plugin

TeamAI 零依赖客户端。被管理项目通过它同步团队技能并上报使用事件。

## 安装

由管理端分发（推荐）：

```bash
npm run teamai:install   # 从 /api/v1/plugin/teamai.mjs 下载到 .teamai/bin
```

或在管理仓本地链接：

```bash
npm install file:/path/to/teeamAITestManage/packages/plugin
npx teamai init --server http://127.0.0.1:4310 --project my-project
```

## 命令

```bash
teamai init [--server URL] [--project ID] [--name NAME] [--token TOKEN]
teamai register
teamai sync [--quiet] [--json] [--no-prune]
teamai status [--json]
teamai skills [--json]
teamai use SLUG [--action TEXT] [--user NAME] [--no-track] [--force] [--quiet]
teamai track --skill SLUG [--action TEXT] [--detail TEXT] [--user NAME] [--duration MS] [--json]
teamai install-hooks
teamai install-agent-hooks
teamai uninstall-agent-hooks
teamai version
```

## 同步行为

1. `POST /api/v1/projects/register` 注册/更新项目。
2. `GET /api/v1/skills` 获取最新技能内容与 SHA-256。
3. 对比 `.teamai/skills/<slug>/SKILL.md`，只写变化的文件。
4. 生成 `.kimi-code/skills/<slug>/SKILL.md` 投影：保留正文与元数据，把 frontmatter 的 `name` 改为 slug，供 Kimi Code 自动发现 `/skill:<slug>`。
5. 清理远端已删除、且曾由插件安装的技能目录（`--no-prune` 可关闭）。
6. 写入 `.teamai/lock.json`，再 `POST /api/v1/events` 上报 `sync` 事件及已安装版本快照。

`status` 会检查四种漂移：`missing`（未安装）、`outdated`（版本落后）、`modified`（文件被改）、`orphan`（远端已删除），并检查 Kimi 投影状态 `linked` / `missing` / `stale`。任何漂移时退出码为 1，可用于 CI。

## 配置

查找顺序：`--config` / `TEAMAI_CONFIG` → 向上查找 `.teamai/config.json`。

环境变量：`TEAMAI_SERVER`、`TEAMAI_PROJECT`、`TEAMAI_TOKEN`、`TEAMAI_USER`。

## 使用上报

Kimi Code 项目会通过 `.kimi-code/skills` 直接发现技能，agent 用 `/skill:<slug>` 调用。安装 hook 后，`Skill` 工具调用会自动上报，来源 `agent-skill`：

```bash
teamai install-agent-hooks     # 写入用户级 ~/.kimi-code/config.toml，可重复执行
teamai uninstall-agent-hooks   # 移除并在修改前备份
```

hook 监听 `PostToolUse` 的 `Read|Skill` 调用：`Skill` 命中 `.teamai/skills/<slug>/SKILL.md` 中的技能时上报；`Read` 读取 `.teamai/skills/<slug>/SKILL.md` 或 `.kimi-code/skills/<slug>/SKILL.md` 时上报（来源 `agent-hook`）。按 `session_id + slug` 去重；3 秒超时、失败静默，不会阻塞 agent。Kimi Code 的 hook 只支持用户级配置，不能随项目下发，新会话启动后生效。

其他 agent、CLI 或 hook 不可用时，用 `teamai use` 一次完成读取与上报：

```bash
teamai use code-review --action "评审了 PR #42" --user alice
```

它把 `SKILL.md` 写到 stdout，并上报一条来源为 `cli-use` 的 `skill.invoked` 事件。若同一技能在 2 分钟内已被 hook 自动上报，`use` 会跳过重复记录（`--force` 强制）。

`teamai track` 仅用于事后补录或第三方 agent 兜底，事件来源标记为 `manual`。

四种来源（`agent-skill` / `agent-hook` / `cli-use` / `manual`）都会写入事件 `meta.source`，管理端在流水里显示为「Agent 技能调用 / Agent 读取 / CLI / 手动补录」。
