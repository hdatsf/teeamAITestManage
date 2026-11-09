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
teamai track --skill SLUG [--action TEXT] [--detail TEXT] [--user NAME] [--duration MS] [--json]
teamai install-hooks
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

```bash
teamai track --skill code-review --action "评审了 PR #42" --user alice
```

写入 `skill.invoked` 事件，包含技能版本、操作描述、耗时与成员名。管理端据此聚合成员、项目和技能热度。
