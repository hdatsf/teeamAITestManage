#!/usr/bin/env node
/**
 * TeamAI client — a zero-dependency CLI installed into a managed project.
 *
 *   teamai init       create .teamai/config.json
 *   teamai register   register this project with the control plane
 *   teamai sync       download published skills into .teamai/skills
 *   teamai status     compare local skills with the control plane
 *   teamai skills     list locally synced skills
 *   teamai track      report a skill invocation for team analytics
 *   teamai install-hooks  sync automatically after git pull/checkout
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '0.1.0';
const DEFAULT_SERVER = 'http://127.0.0.1:4310';
const DEFAULT_TOKEN = 'teamai-demo-token';
const PLUGIN_PATH = fileURLToPath(import.meta.url);

const HELP = `
TeamAI 插件 v${VERSION} — 团队技能同步与使用上报

用法:
  teamai init [--server URL] [--project ID] [--name NAME] [--token TOKEN]
  teamai register
  teamai sync [--quiet] [--json] [--no-prune]
  teamai status [--json]
  teamai skills [--json]
  teamai track --skill SLUG [--action TEXT] [--detail TEXT] [--user NAME] [--duration MS] [--json]
  teamai install-hooks [--quiet]
  teamai version | help

环境变量:
  TEAMAI_SERVER    控制平面地址，默认 ${DEFAULT_SERVER}
  TEAMAI_PROJECT   项目 ID（覆盖配置）
  TEAMAI_TOKEN     项目接入令牌
  TEAMAI_USER      上报事件的用户（默认当前系统用户）
  TEAMAI_CONFIG    指定 .teamai/config.json 路径

同步产物:
  .teamai/skills/<slug>/SKILL.md   技能文件
  .teamai/lock.json                已安装版本与校验和
`.trim();

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function parseFlags(argv) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--') && arg.length > 2) {
      const body = arg.slice(2);
      const eq = body.indexOf('=');
      if (eq !== -1) {
        flags[body.slice(0, eq)] = body.slice(eq + 1);
      } else if (argv[i + 1] && !argv[i + 1].startsWith('--')) {
        flags[body] = argv[i + 1];
        i += 1;
      } else {
        flags[body] = true;
      }
    } else {
      positionals.push(arg);
    }
  }
  return { flags, positionals };
}

function findRoot(startDir = process.cwd()) {
  let dir = path.resolve(startDir);
  for (;;) {
    if (existsSync(path.join(dir, '.teamai', 'config.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function context(flags, { required = true } = {}) {
  const explicitConfig =
    (typeof flags.config === 'string' && flags.config) ||
    process.env.TEAMAI_CONFIG ||
    null;
  let root;
  let configPath;
  if (explicitConfig) {
    configPath = path.resolve(explicitConfig);
    root = path.dirname(path.dirname(configPath));
  } else {
    root = findRoot();
    configPath = root ? path.join(root, '.teamai', 'config.json') : null;
  }
  const config = configPath && existsSync(configPath) ? readJson(configPath) ?? {} : {};
  if (required && (!root || !configPath || !existsSync(configPath))) {
    fail(
      '未找到 .teamai/config.json。请先在被管理项目根目录运行:\n' +
        '  node .teamai/bin/teamai.mjs init --server http://127.0.0.1:4310 --project <project-id>\n' +
        '或从管理端安装: npm run teamai:install',
    );
  }
  root = root ?? process.cwd();
  const serverUrl = String(
    (typeof flags.server === 'string' && flags.server) ||
      process.env.TEAMAI_SERVER ||
      config.serverUrl ||
      DEFAULT_SERVER,
  ).replace(/\/+$/, '');
  const projectId = String(
    (typeof flags.project === 'string' && flags.project) ||
      process.env.TEAMAI_PROJECT ||
      config.projectId ||
      path.basename(root),
  );
  const token = String(
    (typeof flags.token === 'string' && flags.token) || process.env.TEAMAI_TOKEN || config.token || DEFAULT_TOKEN,
  );
  const actor = String(
    (typeof flags.user === 'string' && flags.user) ||
      process.env.TEAMAI_USER ||
      config.actor ||
      os.userInfo().username ||
      'anonymous',
  );
  return {
    root,
    configPath,
    config,
    serverUrl,
    projectId,
    projectName: String(config.projectName || projectId),
    repoUrl: config.repoUrl ? String(config.repoUrl) : undefined,
    token,
    actor,
    skillsDir: path.join(root, '.teamai', 'skills'),
    lockPath: path.join(root, '.teamai', 'lock.json'),
  };
}

async function api(ctx, pathname, options = {}) {
  const url = `${ctx.serverUrl}${pathname}`;
  let response;
  try {
    response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-teamai-token': ctx.token,
        ...(options.headers ?? {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(options.timeout ?? 15000),
    });
  } catch (error) {
    fail(
      `无法连接 TeamAI 控制平面 ${url}\n` +
        `  ${error?.cause?.message ?? error?.message ?? error}\n` +
        '  请确认管理端已启动（管理仓执行 npm run dev），并检查 serverUrl。',
    );
  }
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message = data?.error?.message ?? text ?? response.statusText;
    fail(`TeamAI API ${response.status}: ${message}`);
  }
  return data;
}

function fail(message) {
  console.error(`\n✖ ${message.replace(/\n/g, '\n  ')}\n`);
  process.exit(1);
}

function requireSkills(payload) {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  for (const item of items) {
    if (
      !item ||
      typeof item.slug !== 'string' ||
      !/^[a-z0-9][a-z0-9-]{0,63}$/.test(item.slug) ||
      typeof item.content !== 'string' ||
      typeof item.sha256 !== 'string'
    ) {
      fail('控制平面返回了无效的技能数据（slug/content/sha256）。');
    }
  }
  return items;
}

async function register(ctx, { quiet = false } = {}) {
  const result = await api(ctx, '/api/v1/projects/register', {
    method: 'POST',
    body: { id: ctx.projectId, name: ctx.projectName, repoUrl: ctx.repoUrl },
  });
  if (!quiet) {
    console.log(`✓ 项目已接入: ${result.project?.name ?? ctx.projectId}`);
  }
  return result;
}

function readLock(ctx) {
  const lock = readJson(ctx.lockPath);
  return {
    serverUrl: lock?.serverUrl ?? ctx.serverUrl,
    projectId: lock?.projectId ?? ctx.projectId,
    syncedAt: lock?.syncedAt ?? null,
    pluginVersion: lock?.pluginVersion ?? null,
    skills: Array.isArray(lock?.skills) ? lock.skills : [],
  };
}

function localHash(ctx, slug) {
  const absolute = path.join(ctx.skillsDir, slug, 'SKILL.md');
  if (!existsSync(absolute)) return null;
  return sha256(readFileSync(absolute));
}

function writeSkill(ctx, item) {
  const dir = path.join(ctx.skillsDir, item.slug);
  mkdirSync(dir, { recursive: true });
  const target = path.join(dir, 'SKILL.md');
  const current = existsSync(target) ? readFileSync(target) : null;
  const currentHash = current ? sha256(current) : null;
  if (currentHash === item.sha256) {
    return { changed: false, existed: Boolean(current) };
  }
  writeFileSync(target, item.content, 'utf8');
  return { changed: true, existed: Boolean(current) };
}

async function cmdSync(flags) {
  const ctx = context(flags);
  const started = Date.now();
  await register(ctx, { quiet: true });
  const payload = await api(ctx, '/api/v1/skills');
  const items = requireSkills(payload);
  const previous = readLock(ctx);
  const previousBySlug = new Map(previous.skills.map((item) => [item.slug, item]));
  mkdirSync(ctx.skillsDir, { recursive: true });

  const installed = [];
  let added = 0;
  let updated = 0;
  let unchanged = 0;

  for (const item of items) {
    const result = writeSkill(ctx, item);
    if (!result.changed) unchanged += 1;
    else if (result.existed) updated += 1;
    else added += 1;
    installed.push({
      slug: item.slug,
      version: item.version ?? '0.0.0',
      sha256: item.sha256,
    });
  }

  const remoteSlugs = new Set(items.map((item) => item.slug));
  const removed = [];
  if (!flags['no-prune']) {
    for (const slug of previousBySlug.keys()) {
      if (remoteSlugs.has(slug)) continue;
      rmSync(path.join(ctx.skillsDir, slug), { recursive: true, force: true });
      removed.push(slug);
    }
  }

  const syncedAt = new Date().toISOString();
  const durationMs = Date.now() - started;
  writeFileSync(
    ctx.lockPath,
    `${JSON.stringify(
      {
        serverUrl: ctx.serverUrl,
        projectId: ctx.projectId,
        syncedAt,
        pluginVersion: VERSION,
        skills: installed,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );

  const summaryParts = [];
  if (added) summaryParts.push(`新增 ${added}`);
  if (updated) summaryParts.push(`更新 ${updated}`);
  if (unchanged) summaryParts.push(`未变 ${unchanged}`);
  if (removed.length) summaryParts.push(`移除 ${removed.length}`);
  const summary = summaryParts.length ? summaryParts.join('，') : '无变化';

  await api(ctx, '/api/v1/events', {
    method: 'POST',
    body: {
      projectId: ctx.projectId,
      projectName: ctx.projectName,
      actor: ctx.actor,
      events: [
        {
          type: 'sync',
          summary,
          durationMs,
          createdAt: syncedAt,
          installed,
          meta: { added, updated, unchanged, removed, pluginVersion: VERSION },
        },
      ],
    },
  });

  const result = {
    projectId: ctx.projectId,
    serverUrl: ctx.serverUrl,
    added,
    updated,
    unchanged,
    removed,
    durationMs,
    skills: installed,
  };

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (!flags.quiet) {
    console.log(`\nTeamAI Sync · ${ctx.projectId}`);
    console.log(`  server     ${ctx.serverUrl}`);
    console.log(`  added      ${added}`);
    console.log(`  updated    ${updated}`);
    console.log(`  unchanged  ${unchanged}`);
    console.log(`  removed    ${removed.length}${removed.length ? ` (${removed.join(', ')})` : ''}`);
    console.log(`  duration   ${durationMs}ms`);
    console.log(`  location   .teamai/skills (${installed.length} skills)\n`);
  }
}

async function cmdStatus(flags) {
  const ctx = context(flags);
  const payload = await api(ctx, '/api/v1/skills');
  const items = requireSkills(payload);
  const lock = readLock(ctx);
  const locked = new Map(lock.skills.map((item) => [item.slug, item]));
  const remoteSlugs = new Set(items.map((item) => item.slug));
  const rows = [];

  for (const item of items) {
    const lockedItem = locked.get(item.slug);
    const hash = localHash(ctx, item.slug);
    let state = 'current';
    if (!lockedItem) state = 'missing';
    else if (hash === null) state = 'missing';
    else if (hash !== lockedItem.sha256) state = 'modified';
    else if (lockedItem.version !== item.version) state = 'outdated';
    rows.push({
      slug: item.slug,
      localVersion: lockedItem?.version ?? null,
      remoteVersion: item.version,
      state,
    });
  }

  for (const slug of locked.keys()) {
    if (!remoteSlugs.has(slug)) {
      rows.push({ slug, localVersion: locked.get(slug).version, remoteVersion: null, state: 'orphan' });
    }
  }

  rows.sort((a, b) => a.slug.localeCompare(b.slug));
  const drift = rows.filter((row) => row.state !== 'current');
  const result = {
    projectId: ctx.projectId,
    serverUrl: ctx.serverUrl,
    current: drift.length === 0,
    rows,
  };

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`\nTeamAI Status · ${ctx.projectId}`);
    console.log(`  server  ${ctx.serverUrl}`);
    console.log(`  synced  ${lock.syncedAt ?? 'never'}`);
    console.log('');
    if (rows.length === 0) {
      console.log('  尚未安装任何技能。运行 teamai sync。');
    } else {
      for (const row of rows) {
        const icon =
          row.state === 'current'
            ? '✓'
            : row.state === 'missing'
              ? '＋'
              : row.state === 'orphan'
                ? '－'
                : '!';
        const versions =
          row.remoteVersion === null
            ? `${row.localVersion} (远端已删除)`
            : row.localVersion === row.remoteVersion
              ? row.remoteVersion
              : `${row.localVersion ?? '未安装'} → ${row.remoteVersion}`;
        console.log(`  ${icon} ${row.slug.padEnd(24)} ${versions.padEnd(20)} ${row.state}`);
      }
    }
    console.log('');
  }
  if (drift.length > 0) process.exitCode = 1;
}

function cmdSkills(flags) {
  const ctx = context(flags);
  const lock = readLock(ctx);
  const rows = lock.skills.map((item) => ({
    ...item,
    installed: existsSync(path.join(ctx.skillsDir, item.slug, 'SKILL.md')),
  }));
  if (flags.json) {
    console.log(JSON.stringify({ projectId: ctx.projectId, syncedAt: lock.syncedAt, skills: rows }, null, 2));
    return;
  }
  console.log(`\nTeamAI Skills · ${ctx.projectId}`);
  console.log(`  synced ${lock.syncedAt ?? 'never'}\n`);
  if (rows.length === 0) {
    console.log('  尚无技能，运行 teamai sync。\n');
    return;
  }
  for (const row of rows) {
    console.log(`  ${row.slug.padEnd(26)} v${String(row.version).padEnd(10)} ${row.installed ? 'installed' : 'missing'}`);
  }
  console.log('');
}

async function cmdTrack(flags) {
  const ctx = context(flags);
  const skill = typeof flags.skill === 'string' ? flags.skill : '';
  if (!skill) fail('缺少 --skill。例如: teamai track --skill code-review --action "评审了 PR #42"');
  const lock = readLock(ctx);
  const installed = lock.skills.find((item) => item.slug === skill);
  const version =
    (typeof flags.version === 'string' && flags.version) || installed?.version || null;
  const durationMs = Number(flags.duration);
  const event = {
    type: 'skill.invoked',
    skillSlug: skill,
    version,
    action: typeof flags.action === 'string' ? flags.action : 'invoked',
    detail: typeof flags.detail === 'string' ? flags.detail : typeof flags.note === 'string' ? flags.note : null,
    durationMs: Number.isFinite(durationMs) ? durationMs : null,
    createdAt: new Date().toISOString(),
  };
  await api(ctx, '/api/v1/events', {
    method: 'POST',
    body: {
      projectId: ctx.projectId,
      projectName: ctx.projectName,
      actor: ctx.actor,
      events: [event],
    },
  });
  if (flags.json) {
    console.log(JSON.stringify({ recorded: true, projectId: ctx.projectId, actor: ctx.actor, event }, null, 2));
    return;
  }
  const versionLabel = version ? ` v${version}` : '';
  console.log(`✓ 已记录: ${ctx.actor} 在 ${ctx.projectId} 使用 ${skill}${versionLabel}`);
  if (event.detail) console.log(`  ${event.detail}`);
}

function cmdInit(flags) {
  const explicitRoot = typeof flags.root === 'string' ? path.resolve(flags.root) : process.cwd();
  const teamaiDir = path.join(explicitRoot, '.teamai');
  const configPath = path.join(teamaiDir, 'config.json');
  const existing = existsSync(configPath) ? readJson(configPath) ?? {} : {};
  const serverUrl = String(
    (typeof flags.server === 'string' && flags.server) ||
      existing.serverUrl ||
      process.env.TEAMAI_SERVER ||
      DEFAULT_SERVER,
  ).replace(/\/+$/, '');
  const projectId = String(
    (typeof flags.project === 'string' && flags.project) ||
      existing.projectId ||
      path.basename(explicitRoot),
  );
  const config = {
    serverUrl,
    projectId,
    projectName: String(
      (typeof flags.name === 'string' && flags.name) || existing.projectName || projectId,
    ),
    repoUrl:
      (typeof flags.repo === 'string' && flags.repo) || existing.repoUrl || undefined,
    token: String(
      (typeof flags.token === 'string' && flags.token) ||
        existing.token ||
        process.env.TEAMAI_TOKEN ||
        DEFAULT_TOKEN,
    ),
  };
  if (!config.repoUrl) delete config.repoUrl;
  mkdirSync(path.join(teamaiDir, 'skills'), { recursive: true });
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  console.log(`\n✓ 已写入 ${path.relative(explicitRoot, configPath) || configPath}`);
  console.log(`  server   ${config.serverUrl}`);
  console.log(`  project  ${config.projectId}`);
  console.log(`  token    ${config.token === DEFAULT_TOKEN ? '使用 demo 默认令牌' : '已配置'}`);
  console.log('\n下一步:');
  console.log('  node .teamai/bin/teamai.mjs register');
  console.log('  node .teamai/bin/teamai.mjs sync\n');
}

async function cmdRegister(flags) {
  const ctx = context(flags);
  await register(ctx);
  console.log(`  server   ${ctx.serverUrl}`);
  console.log(`  用于看板: ${ctx.serverUrl}\n`);
}

function cmdInstallHooks(flags) {
  const root = process.cwd();
  const hooksDir = path.join(root, '.githooks');
  mkdirSync(hooksDir, { recursive: true });
  const hook = `#!/bin/sh
# TeamAI: keep team skills in sync after pull/checkout.
if [ -f ".teamai/config.json" ] && [ -f ".teamai/bin/teamai.mjs" ]; then
  node .teamai/bin/teamai.mjs sync --quiet || true
fi
`;
  for (const name of ['post-merge', 'post-checkout']) {
    const file = path.join(hooksDir, name);
    writeFileSync(file, hook, 'utf8');
    try {
      execFileSync('chmod', ['+x', file], { stdio: 'ignore' });
    } catch {
      // chmod is not available on every Windows shell; git still runs hooks via sh.
    }
  }
  let gitOk = false;
  try {
    execFileSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: root, stdio: 'ignore' });
    gitOk = true;
  } catch {
    // not a git repository
  }
  if (!flags.quiet) {
    console.log(`\n✓ 已安装 Git hooks 到 .githooks/ (post-merge, post-checkout)`);
    console.log(gitOk ? '  已设置 core.hooksPath=.githooks\n' : '  当前目录不是 Git 仓库，请手动设置 core.hooksPath\n');
  }
}

function printPluginInfo() {
  console.log(`teamai ${VERSION}`);
  console.log(`plugin ${PLUGIN_PATH}`);
}

async function main() {
  const [command = 'help', ...rest] = process.argv.slice(2);
  const { flags } = parseFlags(rest);
  switch (command) {
    case 'init':
      cmdInit(flags);
      break;
    case 'register':
      await cmdRegister(flags);
      break;
    case 'sync':
      await cmdSync(flags);
      break;
    case 'status':
      await cmdStatus(flags);
      break;
    case 'skills':
      cmdSkills(flags);
      break;
    case 'track':
    case 'report':
      await cmdTrack(flags);
      break;
    case 'install-hooks':
      cmdInstallHooks(flags);
      break;
    case 'version':
    case '--version':
    case '-v':
      printPluginInfo();
      break;
    case 'help':
    case '--help':
    case '-h':
      console.log(HELP);
      break;
    default:
      console.error(`未知命令: ${command}\n`);
      console.log(HELP);
      process.exitCode = 1;
  }
}

main().catch((error) => {
  fail(error?.stack ?? error?.message ?? String(error));
});
