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
teamai use SLUG [--action TEXT] [--user NAME] [--no-track] [--quiet]
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
4. 清理远端已删除、且曾由插件安装的技能目录（`--no-prune` 可关闭）。
5. 写入 `.teamai/lock.json`，再 `POST /api/v1/events` 上报 `sync` 事件及已安装版本快照。

`status` 会检查四种漂移：`missing`（未安装）、`outdated`（版本落后）、`modified`（文件被改）、`orphan`（远端已删除）。存在漂移时退出码为 1，可用于 CI。

## 配置

查找顺序：`--config` / `TEAMAI_CONFIG` → 向上查找 `.teamai/config.json`。

环境变量：`TEAMAI_SERVER`、`TEAMAI_PROJECT`、`TEAMAI_TOKEN`、`TEAMAI_USER`。

## 使用上报

推荐让 agent 直接调用 `teamai use`，读取与上报是一次原子操作：

```bash
teamai use code-review --action "评审了 PR #42" --user alice
```

它把 `SKILL.md` 写到 stdout，并上报一条来源为 `cli-use` 的 `skill.invoked` 事件。

也可以安装 Kimi Code 的自动上报 hook：

```bash
teamai install-agent-hooks     # 写入用户级 ~/.kimi-code/config.toml，可重复执行
teamai uninstall-agent-hooks   # 移除并在修改前备份
```

hook 监听 `PostToolUse` 的 `Read` 调用，只在读取 `.teamai/skills/<slug>/SKILL.md` 时上报，按 `session_id + slug` 去重；3 秒超时、失败静默，不会阻塞 agent。Kimi Code 的 hook 只支持用户级配置，不能随项目下发，新会话启动后生效。

`teamai track` 仅用于事后补录或第三方 agent 兜底，事件来源标记为 `manual`。

三种来源（`agent-hook` / `cli-use` / `manual`）都会写入事件 `meta.source`，管理端在流水里显示为「Agent 自动 / CLI / 手动补录」。
