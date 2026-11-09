import {
  all,
  get,
  latestSkillBySlug,
  latestSkills,
  nowIso,
  renderSkillContent,
  run,
  sha256,
  type SkillVersionRow,
} from './db.js';

const SYSTEM_ACTOR = 'teamai-admin';

export interface Activity {
  id: number;
  type: string;
  projectId: string | null;
  projectName: string | null;
  actor: string;
  skillSlug: string | null;
  skillName: string | null;
  version: string | null;
  action: string | null;
  detail: string | null;
  durationMs: number | null;
  createdAt: string;
}

export interface SkillView {
  slug: string;
  name: string;
  description: string;
  tags: string[];
  version: string;
  publishedAt: string;
  publishedBy: string;
  updatedAt: string;
  body: string;
  content: string;
  sha256: string;
  stats: {
    invocations7d: number;
    projects: number;
    projectsCurrent: number;
  };
}

export interface ProjectView {
  id: string;
  name: string;
  repoUrl: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  lastSyncAt: string | null;
  lastSyncBy: string | null;
  syncs7d: number;
  invocations7d: number;
  installedCount: number;
  behind: Array<{
    slug: string;
    name: string;
    installedVersion: string;
    latestVersion: string;
  }>;
  users: string[];
  status: 'current' | 'behind' | 'never';
}

export interface UserUsage {
  actor: string;
  invocations: number;
  syncs: number;
  lastActive: string;
  projects: string[];
  topSkill: string | null;
}

function cutoff(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function dateSeries(days: number, rows: Array<{ date: string; count: number }>) {
  const map = new Map(rows.map((row) => [row.date, row.count]));
  const series: Array<{ date: string; count: number }> = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
    series.push({ date, count: map.get(date) ?? 0 });
  }
  return series;
}

function skillCountsSince(days: number): Map<string, number> {
  const rows = all<{ skill_slug: string; count: number }>(
    `SELECT skill_slug, COUNT(*) AS count
     FROM events
     WHERE type = 'skill.invoked' AND created_at >= ? AND skill_slug IS NOT NULL
     GROUP BY skill_slug`,
    cutoff(days),
  );
  return new Map(rows.map((row) => [row.skill_slug, row.count]));
}

function skillViews(days = 7): SkillView[] {
  const latest = latestSkills();
  const counts = skillCountsSince(days);
  const adoption = all<{ slug: string; project_id: string; version: string }>(
    'SELECT slug, project_id, version FROM project_skills',
  );
  return latest.map((row) => {
    const tags = safeJsonArray(row.tags);
    const installed = adoption.filter((item) => item.slug === row.slug);
    return {
      slug: row.slug,
      name: row.name,
      description: row.description,
      tags,
      version: row.version,
      publishedAt: row.publishedAt,
      publishedBy: row.publishedBy,
      updatedAt: row.updatedAt,
      body: row.body,
      content: renderSkillContent({
        slug: row.slug,
        name: row.name,
        description: row.description,
        tags,
        version: row.version,
        publishedAt: row.publishedAt,
        publishedBy: row.publishedBy,
        body: row.body,
      }),
      sha256: row.sha256,
      stats: {
        invocations7d: counts.get(row.slug) ?? 0,
        projects: installed.length,
        projectsCurrent: installed.filter((item) => item.version === row.version).length,
      },
    };
  });
}

function safeJsonArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function latestVersionMap(): Map<string, { version: string; name: string }> {
  return new Map(
    latestSkills().map((row) => [row.slug, { version: row.version, name: row.name }]),
  );
}

function projectRows(): ProjectView[] {
  const latest = latestVersionMap();
  const projects = all<{
    id: string;
    name: string;
    repoUrl: string | null;
    createdAt: string;
    lastSeenAt: string | null;
  }>(
    `SELECT id, name, repo_url AS repoUrl, created_at AS createdAt, last_seen_at AS lastSeenAt
     FROM projects ORDER BY name COLLATE NOCASE`,
  );
  const since = cutoff(7);
  const syncs = all<{ project_id: string; count: number }>(
    `SELECT project_id, COUNT(*) AS count FROM events
     WHERE type = 'sync' AND created_at >= ? GROUP BY project_id`,
    since,
  );
  const invocations = all<{ project_id: string; count: number }>(
    `SELECT project_id, COUNT(*) AS count FROM events
     WHERE type = 'skill.invoked' AND created_at >= ? GROUP BY project_id`,
    since,
  );
  const syncMap = new Map(syncs.map((row) => [row.project_id, row.count]));
  const invocationMap = new Map(invocations.map((row) => [row.project_id, row.count]));

  return projects.map((project) => {
    const installed = all<{ slug: string; version: string; syncedAt: string }>(
      `SELECT slug, version, synced_at AS syncedAt FROM project_skills WHERE project_id = ?`,
      project.id,
    );
    const behind = installed
      .filter((item) => latest.get(item.slug)?.version !== item.version)
      .map((item) => ({
        slug: item.slug,
        name: latest.get(item.slug)?.name ?? item.slug,
        installedVersion: item.version,
        latestVersion: latest.get(item.slug)?.version ?? 'unknown',
      }));
    const lastSync = get<{ createdAt: string; actor: string }>(
      `SELECT created_at AS createdAt, actor FROM events
       WHERE project_id = ? AND type = 'sync'
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      project.id,
    );
    const users = all<{ actor: string }>(
      `SELECT DISTINCT actor FROM events
       WHERE project_id = ? AND actor != ? AND created_at >= ? ORDER BY actor`,
      project.id,
      SYSTEM_ACTOR,
      cutoff(30),
    ).map((row) => row.actor);
    const status: ProjectView['status'] = !lastSync
      ? 'never'
      : behind.length > 0
        ? 'behind'
        : 'current';
    return {
      ...project,
      lastSyncAt: lastSync?.createdAt ?? null,
      lastSyncBy: lastSync?.actor ?? null,
      syncs7d: syncMap.get(project.id) ?? 0,
      invocations7d: invocationMap.get(project.id) ?? 0,
      installedCount: installed.length,
      behind,
      users,
      status,
    };
  });
}

export function getOverview(days = 14) {
  const projects = projectRows();
  const skills = skillViews(7);
  const since = cutoff(days);
  const syncRows = all<{ date: string; count: number }>(
    `SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS count
     FROM events WHERE type = 'sync' AND created_at >= ? GROUP BY date`,
    since,
  );
  const invocationRows = all<{ date: string; count: number }>(
    `SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS count
     FROM events WHERE type = 'skill.invoked' AND created_at >= ? GROUP BY date`,
    since,
  );
  const activeUsers = get<{ count: number }>(
    `SELECT COUNT(DISTINCT actor) AS count FROM events
     WHERE actor != ? AND created_at >= ?`,
    SYSTEM_ACTOR,
    cutoff(7),
  );
  const syncCount = get<{ count: number }>(
    `SELECT COUNT(*) AS count FROM events WHERE type = 'sync' AND created_at >= ?`,
    cutoff(7),
  );
  const invocationCount = get<{ count: number }>(
    `SELECT COUNT(*) AS count FROM events WHERE type = 'skill.invoked' AND created_at >= ?`,
    cutoff(7),
  );

  return {
    totals: {
      projects: projects.length,
      skills: skills.length,
      syncs7d: syncCount?.count ?? 0,
      invocations7d: invocationCount?.count ?? 0,
      activeUsers7d: activeUsers?.count ?? 0,
      behindProjects: projects.filter((project) => project.status !== 'current').length,
    },
    series: dateSeries(days, syncRows).map((row, index) => ({
      date: row.date,
      syncs: row.count,
      invocations: dateSeries(days, invocationRows)[index]?.count ?? 0,
    })),
    recent: getActivity(12),
    projects,
    skills,
  };
}

export function getProjects(): ProjectView[] {
  return projectRows();
}

export function getSkillViews(days = 7): SkillView[] {
  return skillViews(days);
}

export function getActivity(limit = 50): Activity[] {
  return all<Activity>(
    `SELECT e.id, e.type, e.project_id AS projectId, p.name AS projectName,
            e.actor, e.skill_slug AS skillSlug, s.name AS skillName,
            e.version, e.action, e.detail, e.duration_ms AS durationMs,
            e.created_at AS createdAt
     FROM events e
     LEFT JOIN projects p ON p.id = e.project_id
     LEFT JOIN skills s ON s.slug = e.skill_slug
     ORDER BY e.created_at DESC, e.id DESC
     LIMIT ?`,
    limit,
  );
}

export function getUsage(days = 30) {
  const since = cutoff(days);
  const users = all<{
    actor: string;
    invocations: number;
    syncs: number;
    lastActive: string;
  }>(
    `SELECT actor,
            SUM(CASE WHEN type = 'skill.invoked' THEN 1 ELSE 0 END) AS invocations,
            SUM(CASE WHEN type = 'sync' THEN 1 ELSE 0 END) AS syncs,
            MAX(created_at) AS lastActive
     FROM events
     WHERE actor != ? AND created_at >= ?
     GROUP BY actor ORDER BY invocations DESC, syncs DESC, actor`,
    SYSTEM_ACTOR,
    since,
  );
  const projectsByActor = all<{ actor: string; project_id: string }>(
    `SELECT DISTINCT actor, project_id FROM events
     WHERE project_id IS NOT NULL AND actor != ? AND created_at >= ?`,
    SYSTEM_ACTOR,
    since,
  );
  const topSkills = all<{ actor: string; skill_slug: string; count: number }>(
    `SELECT actor, skill_slug, COUNT(*) AS count FROM events
     WHERE type = 'skill.invoked' AND skill_slug IS NOT NULL AND actor != ? AND created_at >= ?
     GROUP BY actor, skill_slug ORDER BY count DESC`,
    SYSTEM_ACTOR,
    since,
  );
  const skillUses = all<{ slug: string; name: string; count: number }>(
    `SELECT e.skill_slug AS slug, COALESCE(s.name, e.skill_slug) AS name, COUNT(*) AS count
     FROM events e LEFT JOIN skills s ON s.slug = e.skill_slug
     WHERE e.type = 'skill.invoked' AND e.skill_slug IS NOT NULL AND e.created_at >= ?
     GROUP BY e.skill_slug ORDER BY count DESC`,
    since,
  );
  const projectUses = all<{ projectId: string; name: string; count: number }>(
    `SELECT e.project_id AS projectId, COALESCE(p.name, e.project_id) AS name, COUNT(*) AS count
     FROM events e LEFT JOIN projects p ON p.id = e.project_id
     WHERE e.type = 'skill.invoked' AND e.project_id IS NOT NULL AND e.created_at >= ?
     GROUP BY e.project_id ORDER BY count DESC`,
    since,
  );
  const daily = all<{ date: string; count: number }>(
    `SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS count
     FROM events WHERE type = 'skill.invoked' AND created_at >= ? GROUP BY date`,
    since,
  );

  const topSkillByActor = new Map<string, string>();
  for (const row of topSkills) {
    if (!topSkillByActor.has(row.actor)) topSkillByActor.set(row.actor, row.skill_slug);
  }

  const userViews: UserUsage[] = users.map((user) => ({
    ...user,
    projects: projectsByActor.filter((row) => row.actor === user.actor).map((row) => row.project_id),
    topSkill: topSkillByActor.get(user.actor) ?? null,
  }));

  return {
    days,
    users: userViews,
    skills: skillUses,
    projects: projectUses,
    daily: dateSeries(days, daily),
  };
}

export function getProjectDetail(id: string) {
  const project = projectRows().find((row) => row.id === id);
  if (!project) return null;
  const latest = latestVersionMap();
  const installed = all<{ slug: string; version: string; syncedAt: string }>(
    `SELECT slug, version, synced_at AS syncedAt FROM project_skills
     WHERE project_id = ? ORDER BY slug`,
    id,
  ).map((row) => ({
    ...row,
    name: latest.get(row.slug)?.name ?? row.slug,
    latestVersion: latest.get(row.slug)?.version ?? 'unknown',
    current: latest.get(row.slug)?.version === row.version,
  }));
  const events = all<Activity>(
    `SELECT e.id, e.type, e.project_id AS projectId, p.name AS projectName,
            e.actor, e.skill_slug AS skillSlug, s.name AS skillName,
            e.version, e.action, e.detail, e.duration_ms AS durationMs,
            e.created_at AS createdAt
     FROM events e
     LEFT JOIN projects p ON p.id = e.project_id
     LEFT JOIN skills s ON s.slug = e.skill_slug
     WHERE e.project_id = ?
     ORDER BY e.created_at DESC, e.id DESC LIMIT 30`,
    id,
  );
  return { project, installed, events };
}

function bumpPatch(version: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return '1.0.1';
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

function normalizeTags(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.map((tag) => String(tag).trim()).filter(Boolean);
  }
  if (typeof input === 'string') {
    return input.split(',').map((tag) => tag.trim()).filter(Boolean);
  }
  return [];
}

export interface PublishInput {
  slug?: unknown;
  name?: unknown;
  description?: unknown;
  tags?: unknown;
  body?: unknown;
  version?: unknown;
  publishedBy?: unknown;
}

export function publishSkill(input: PublishInput) {
  const slug = String(input.slug ?? '').trim();
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) {
    throw httpError(400, 'INVALID_SLUG', 'slug 需为小写字母、数字或连字符，且以字母/数字开头');
  }
  const name = String(input.name ?? '').trim();
  if (!name) throw httpError(400, 'INVALID_NAME', '名称不能为空');
  const body = String(input.body ?? '').replace(/\r\n/g, '\n').trim();
  if (!body) throw httpError(400, 'INVALID_BODY', '技能内容不能为空');
  const description = String(input.description ?? '').trim();
  const tags = normalizeTags(input.tags);
  const publishedBy = String(input.publishedBy ?? SYSTEM_ACTOR).trim() || SYSTEM_ACTOR;
  const existing = latestSkillBySlug(slug);
  const requestedVersion = String(input.version ?? '').trim();
  if (requestedVersion && !/^\d+\.\d+\.\d+$/.test(requestedVersion)) {
    throw httpError(400, 'INVALID_VERSION', '版本号需符合 semver，例如 1.2.0');
  }
  const version = requestedVersion || (existing ? bumpPatch(existing.version) : '1.0.0');
  const duplicate = get<{ id: number }>(
    'SELECT id FROM skill_versions WHERE slug = ? AND version = ?',
    slug,
    version,
  );
  if (duplicate) {
    throw httpError(409, 'VERSION_EXISTS', `版本 ${version} 已存在，请使用新的版本号`);
  }

  const now = nowIso();
  const publishedAt = now;
  if (existing) {
    run(
      `UPDATE skills SET name = ?, description = ?, tags = ?, updated_at = ? WHERE slug = ?`,
      name,
      description,
      JSON.stringify(tags),
      now,
      slug,
    );
  } else {
    run(
      `INSERT INTO skills (slug, name, description, tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      slug,
      name,
      description,
      JSON.stringify(tags),
      now,
      now,
    );
  }
  const content = renderSkillContent({
    slug,
    name,
    description,
    tags,
    version,
    publishedAt,
    publishedBy,
    body,
  });
  run(
    `INSERT INTO skill_versions (slug, version, body, sha256, published_by, published_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    slug,
    version,
    body,
    sha256(content),
    publishedBy,
    publishedAt,
  );
  run(
    `INSERT INTO events (type, project_id, actor, skill_slug, version, action, detail, created_at, meta)
     VALUES ('skill.published', NULL, ?, ?, ?, ?, ?, ?, ?)`,
    publishedBy,
    slug,
    version,
    `发布了 ${name} v${version}`,
    `已发布到 TeamAI 技能库`,
    publishedAt,
    JSON.stringify({ tags }),
  );
  return {
    skill: latestSkillBySlug(slug),
    publishedVersion: version,
  };
}

export function registerProject(
  input: { id?: unknown; name?: unknown; repoUrl?: unknown },
  touch = true,
) {
  const id = String(input.id ?? '').trim();
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(id)) {
    throw httpError(400, 'INVALID_PROJECT_ID', '项目 ID 只能包含字母、数字、点、下划线和连字符');
  }
  const name = String(input.name ?? id).trim() || id;
  const repoUrl = input.repoUrl ? String(input.repoUrl).trim() : null;
  const now = nowIso();
  run(
    `INSERT INTO projects (id, name, repo_url, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET name = excluded.name,
       repo_url = COALESCE(excluded.repo_url, projects.repo_url)`,
    id,
    name,
    repoUrl,
    now,
    touch ? now : null,
  );
  return get<{
    id: string;
    name: string;
    repoUrl: string | null;
    createdAt: string;
    lastSeenAt: string | null;
  }>(
    `SELECT id, name, repo_url AS repoUrl, created_at AS createdAt, last_seen_at AS lastSeenAt
     FROM projects WHERE id = ?`,
    id,
  );
}

const ALLOWED_EVENT_TYPES = new Set([
  'sync',
  'skill.invoked',
  'skill.viewed',
  'agent.run',
  'skill.published',
]);

export interface IngestEvent {
  type?: unknown;
  skillSlug?: unknown;
  version?: unknown;
  action?: unknown;
  detail?: unknown;
  durationMs?: unknown;
  createdAt?: unknown;
  installed?: unknown;
  summary?: unknown;
  meta?: unknown;
}

export function ingestEvents(payload: {
  projectId?: unknown;
  projectName?: unknown;
  actor?: unknown;
  events?: unknown;
}) {
  const projectId = String(payload.projectId ?? '').trim();
  if (!projectId) throw httpError(400, 'MISSING_PROJECT', '缺少 projectId');
  const actor = String(payload.actor ?? '').trim();
  if (!actor) throw httpError(400, 'MISSING_ACTOR', '缺少 actor');
  const events = Array.isArray(payload.events) ? payload.events : [];
  if (events.length === 0) throw httpError(400, 'NO_EVENTS', 'events 不能为空');
  if (events.length > 500) throw httpError(400, 'TOO_MANY_EVENTS', '单次最多上报 500 条事件');

  registerProject(
    {
      id: projectId,
      name: payload.projectName ?? projectId,
    },
    false,
  );

  let accepted = 0;
  let lastSeen: string | null = null;

  for (const raw of events as IngestEvent[]) {
    const type = String(raw.type ?? '');
    if (!ALLOWED_EVENT_TYPES.has(type)) {
      continue;
    }
    const createdAt = normalizeTimestamp(raw.createdAt);
    const skillSlug = raw.skillSlug ? String(raw.skillSlug) : null;
    const version = raw.version ? String(raw.version) : null;
    const action = raw.action ? String(raw.action) : null;
    const detail = raw.detail ? String(raw.detail) : null;
    const durationMs = Number.isFinite(Number(raw.durationMs)) ? Number(raw.durationMs) : null;
    const meta: Record<string, unknown> = {};
    if (raw.summary) meta.summary = String(raw.summary);
    if (Array.isArray(raw.installed)) meta.installed = raw.installed;
    if (raw.meta && typeof raw.meta === 'object') Object.assign(meta, raw.meta);

    run(
      `INSERT INTO events (type, project_id, actor, skill_slug, version, action, detail, duration_ms, created_at, meta)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      type,
      projectId,
      actor,
      skillSlug,
      version,
      action,
      detail,
      durationMs,
      createdAt,
      Object.keys(meta).length > 0 ? JSON.stringify(meta) : null,
    );
    accepted += 1;
    if (!lastSeen || createdAt > lastSeen) lastSeen = createdAt;

    if (type === 'sync' && Array.isArray(raw.installed)) {
      run('DELETE FROM project_skills WHERE project_id = ?', projectId);
      for (const item of raw.installed as Array<Record<string, unknown>>) {
        const slug = String(item.slug ?? '').trim();
        const installedVersion = String(item.version ?? '').trim();
        if (!slug || !installedVersion) continue;
        run(
          `INSERT OR REPLACE INTO project_skills (project_id, slug, version, sha256, synced_at)
           VALUES (?, ?, ?, ?, ?)`,
          projectId,
          slug,
          installedVersion,
          String(item.sha256 ?? ''),
          createdAt,
        );
      }
    }
  }

  if (accepted === 0) {
    throw httpError(400, 'NO_VALID_EVENTS', '没有可接受的事件类型');
  }
  run(
    'UPDATE projects SET last_seen_at = MAX(COALESCE(last_seen_at, \'\'), ?) WHERE id = ?',
    lastSeen ?? nowIso(),
    projectId,
  );
  return { accepted, projectId };
}

function normalizeTimestamp(value: unknown): string {
  const parsed = value ? new Date(String(value)) : new Date();
  if (Number.isNaN(parsed.getTime())) return nowIso();
  const now = Date.now();
  return new Date(Math.min(parsed.getTime(), now)).toISOString();
}

export interface HttpError extends Error {
  status: number;
  code: string;
}

export function httpError(status: number, code: string, message: string): HttpError {
  const error = new Error(message) as HttpError;
  error.status = status;
  error.code = code;
  return error;
}

export function getSkillRows(): SkillVersionRow[] {
  return latestSkills();
}
