import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverUrl = (process.env.TEAMAI_SERVER ?? 'http://127.0.0.1:4310').replace(/\/+$/, '');
const token = process.env.TEAMAI_TOKEN ?? 'teamai-demo-token';
const plugin = path.join(root, 'packages/plugin/teamai.mjs');
const workDir = path.join(root, '.tmp/teammates');

const teammates = [
  {
    projectId: 'marketing-site',
    projectName: 'Marketing Site',
    repoUrl: 'https://github.com/hdatsf/marketing-site',
    actor: 'alice',
    usages: [
      { skill: 'code-review', action: '评审了 2026 秋季活动页 PR', days: 0 },
      { skill: 'release-notes', action: '生成了营销站 v2.4.0 发布说明', days: 1 },
      { skill: 'code-review', action: '评审了 SEO 结构化数据改动', days: 3 },
    ],
  },
  {
    projectId: 'payments-api',
    projectName: 'Payments API',
    repoUrl: 'https://github.com/hdatsf/payments-api',
    actor: 'bob',
    usages: [
      { skill: 'api-design', action: '设计了批量退款接口 /v1/refunds/batch', days: 0 },
      { skill: 'code-review', action: '评审了支付回调幂等逻辑', days: 2 },
      { skill: 'incident-postmortem', action: '复盘了网关 P99 抖动', days: 4 },
    ],
  },
  {
    projectId: 'data-pipeline',
    projectName: 'Data Pipeline',
    repoUrl: 'https://github.com/hdatsf/data-pipeline',
    actor: 'carol',
    usages: [
      { skill: 'release-notes', action: '整理了数据管道 v0.9 发布说明', days: 0 },
      { skill: 'incident-postmortem', action: '复盘了延迟告警风暴', days: 2 },
      { skill: 'code-review', action: '评审了 Flink 状态迁移改动', days: 5 },
    ],
  },
];

async function request(pathname, init = {}) {
  const response = await fetch(`${serverUrl}${pathname}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-teamai-token': token,
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!response.ok) {
    throw new Error(`${pathname} → ${response.status}: ${data?.error?.message ?? text}`);
  }
  return data;
}

function isoDaysAgo(days, hour, minute) {
  if (days === 0) {
    const offsetMinutes = ((hour * 60 + minute) % 360) + 1;
    return new Date(Date.now() - offsetMinutes * 60_000).toISOString();
  }
  const date = new Date(Date.now() - days * 86_400_000);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

async function main() {
  try {
    const health = await request('/api/v1/health');
    console.log(`TeamAI control plane: ${serverUrl} (plugin ${health.pluginVersion})`);
  } catch (error) {
    console.error(`\n无法连接管理端 ${serverUrl}。请先在管理仓运行 npm run dev。\n`);
    console.error(error.message);
    process.exit(1);
  }

  for (const teammate of teammates) {
    const dir = path.join(workDir, teammate.projectId);
    mkdirSync(path.join(dir, '.teamai', 'skills'), { recursive: true });
    writeFileSync(
      path.join(dir, '.teamai', 'config.json'),
      `${JSON.stringify(
        {
          serverUrl,
          projectId: teammate.projectId,
          projectName: teammate.projectName,
          repoUrl: teammate.repoUrl,
          token,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );

    console.log(`\n[${teammate.actor}] syncing ${teammate.projectId}…`);
    const result = spawnSync(process.execPath, [plugin, 'sync', '--quiet'], {
      cwd: dir,
      env: { ...process.env, TEAMAI_SERVER: serverUrl, TEAMAI_TOKEN: token, TEAMAI_USER: teammate.actor },
      stdio: 'inherit',
    });
    if (result.status !== 0) {
      process.exit(result.status ?? 1);
    }

    const lock = JSON.parse(readFileSync(path.join(dir, '.teamai', 'lock.json'), 'utf8'));
    const versionBySkill = new Map(lock.skills.map((item) => [item.slug, item.version]));
    const events = teammate.usages.map((usage, index) => ({
      type: 'skill.invoked',
      skillSlug: usage.skill,
      version: versionBySkill.get(usage.skill) ?? null,
      action: usage.action,
      detail: usage.action,
      durationMs: 70 + index * 23,
      createdAt: isoDaysAgo(usage.days, 10 + index, 12 + index * 3),
    }));
    await request('/api/v1/events', {
      method: 'POST',
      body: JSON.stringify({
        projectId: teammate.projectId,
        projectName: teammate.projectName,
        actor: teammate.actor,
        events,
      }),
    });
    console.log(`  reported ${events.length} skill invocations as ${teammate.actor}`);
  }

  console.log('\n✓ 模拟完成。打开 http://127.0.0.1:5173 查看 Projects / Usage 数据。');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
