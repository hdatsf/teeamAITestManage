import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const DATA_DIR = process.env.TEAMAI_DATA_DIR
  ? path.resolve(process.env.TEAMAI_DATA_DIR)
  : path.join(ROOT, 'data');
export const DB_PATH = path.join(DATA_DIR, 'teamai.db');

mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    repo_url TEXT,
    created_at TEXT NOT NULL,
    last_seen_at TEXT
  );

  CREATE TABLE IF NOT EXISTS skills (
    slug TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    tags TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS skill_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT NOT NULL REFERENCES skills(slug) ON DELETE CASCADE,
    version TEXT NOT NULL,
    body TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    published_by TEXT NOT NULL,
    published_at TEXT NOT NULL,
    UNIQUE (slug, version)
  );

  CREATE TABLE IF NOT EXISTS project_skills (
    project_id TEXT NOT NULL,
    slug TEXT NOT NULL,
    version TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    synced_at TEXT NOT NULL,
    PRIMARY KEY (project_id, slug)
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    project_id TEXT,
    actor TEXT NOT NULL,
    skill_slug TEXT,
    version TEXT,
    action TEXT,
    detail TEXT,
    duration_ms INTEGER,
    created_at TEXT NOT NULL,
    meta TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_events_created ON events (created_at);
  CREATE INDEX IF NOT EXISTS idx_events_project ON events (project_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_events_skill ON events (skill_slug, created_at);
  CREATE INDEX IF NOT EXISTS idx_versions_slug ON skill_versions (slug, published_at);

  CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

export function all<T>(sql: string, ...params: unknown[]): T[] {
  return db.prepare(sql).all(...(params as never[])) as T[];
}

export function get<T>(sql: string, ...params: unknown[]): T | undefined {
  return db.prepare(sql).get(...(params as never[])) as T | undefined;
}

export function run(sql: string, ...params: unknown[]) {
  return db.prepare(sql).run(...(params as never[]));
}

export const nowIso = () => new Date().toISOString();

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export interface SkillVersionRow {
  slug: string;
  name: string;
  description: string;
  tags: string;
  createdAt: string;
  updatedAt: string;
  version: string;
  body: string;
  sha256: string;
  publishedAt: string;
  publishedBy: string;
}

export function renderSkillContent(skill: {
  slug: string;
  name: string;
  description: string;
  tags: string[];
  version: string;
  publishedAt: string;
  publishedBy: string;
  body: string;
}): string {
  const tags = skill.tags.length > 0 ? skill.tags.join(', ') : '';
  return [
    '---',
    `name: ${skill.name}`,
    `slug: ${skill.slug}`,
    `version: ${skill.version}`,
    `description: ${skill.description}`,
    `tags: ${tags}`,
    `published_at: ${skill.publishedAt}`,
    `published_by: ${skill.publishedBy}`,
    '---',
    '',
    skill.body.replace(/\r\n/g, '\n').trim(),
    '',
  ].join('\n');
}

export function latestSkills(): SkillVersionRow[] {
  return all<SkillVersionRow>(`
    SELECT s.slug, s.name, s.description, s.tags,
           s.created_at AS createdAt, s.updated_at AS updatedAt,
           v.version, v.body, v.sha256,
           v.published_at AS publishedAt, v.published_by AS publishedBy
    FROM skills s
    JOIN skill_versions v ON v.slug = s.slug
    WHERE v.id = (
      SELECT v2.id FROM skill_versions v2
      WHERE v2.slug = s.slug
      ORDER BY v2.published_at DESC, v2.id DESC
      LIMIT 1
    )
    ORDER BY s.name COLLATE NOCASE
  `);
}

export function latestSkillBySlug(slug: string): SkillVersionRow | undefined {
  return get<SkillVersionRow>(
    `SELECT s.slug, s.name, s.description, s.tags,
            s.created_at AS createdAt, s.updated_at AS updatedAt,
            v.version, v.body, v.sha256,
            v.published_at AS publishedAt, v.published_by AS publishedBy
     FROM skills s
     JOIN skill_versions v ON v.slug = s.slug
     WHERE s.slug = ? AND v.id = (
       SELECT v2.id FROM skill_versions v2
       WHERE v2.slug = s.slug
       ORDER BY v2.published_at DESC, v2.id DESC
       LIMIT 1
     )`,
    slug,
  );
}

interface ParsedSkill {
  slug: string;
  name: string;
  description: string;
  tags: string[];
  version: string;
  body: string;
}

function parseSkillFile(fileName: string, raw: string): ParsedSkill {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw.replace(/^\uFEFF/, ''));
  if (!match) {
    throw new Error(`Skill file ${fileName} is missing YAML frontmatter`);
  }
  const meta: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    meta[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  const slug = meta.slug ?? fileName.replace(/\.md$/i, '');
  return {
    slug,
    name: meta.name ?? slug,
    description: meta.description ?? '',
    tags: meta.tags ? meta.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : [],
    version: meta.version ?? '1.0.0',
    body: match[2].trim(),
  };
}

const PREVIOUS_VERSIONS: Record<string, string> = {
  'code-review': '1.1.0',
  'release-notes': '1.0.2',
  'api-design': '1.9.0',
  'incident-postmortem': '0.9.0',
};

function insertVersion(
  skill: ParsedSkill,
  version: string,
  publishedAt: string,
  publishedBy: string,
) {
  const content = renderSkillContent({ ...skill, version, publishedAt, publishedBy });
  run(
    `INSERT OR IGNORE INTO skill_versions (slug, version, body, sha256, published_by, published_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    skill.slug,
    version,
    skill.body,
    sha256(content),
    publishedBy,
    publishedAt,
  );
}

function addEvent(event: {
  type: string;
  projectId?: string | null;
  actor: string;
  skillSlug?: string | null;
  version?: string | null;
  action?: string | null;
  detail?: string | null;
  durationMs?: number | null;
  createdAt: string;
  meta?: unknown;
}) {
  run(
    `INSERT INTO events (type, project_id, actor, skill_slug, version, action, detail, duration_ms, created_at, meta)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    event.type,
    event.projectId ?? null,
    event.actor,
    event.skillSlug ?? null,
    event.version ?? null,
    event.action ?? null,
    event.detail ?? null,
    event.durationMs ?? null,
    event.createdAt,
    event.meta ? JSON.stringify(event.meta) : null,
  );
}

function daysAgo(days: number, hour = 9, minute = 0): string {
  const date = new Date();
  if (days === 0) {
    const offsetMinutes = ((hour * 60 + minute) % 360) + 1;
    return new Date(Date.now() - offsetMinutes * 60_000).toISOString();
  }
  date.setUTCDate(date.getUTCDate() - days);
  date.setUTCHours(hour, minute, 0, 0);
  return date.toISOString();
}

const SEED_USERS = ['alice', 'bob', 'carol', 'david'] as const;

function seedIfNeeded() {
  const seeded = get<{ value: string }>('SELECT value FROM meta WHERE key = ?', 'seed_version');
  if (seeded?.value === '2') return;

  const skillsDir = path.join(ROOT, 'skills');
  const files = readdirSync(skillsDir).filter((file) => file.endsWith('.md')).sort();
  const parsed = files.map((file) =>
    parseSkillFile(file, readFileSync(path.join(skillsDir, file), 'utf8')),
  );

  const publishedAtBySlug: Record<string, string> = {
    'code-review': daysAgo(12, 3, 10),
    'release-notes': daysAgo(10, 5, 20),
    'api-design': daysAgo(9, 2, 45),
    'incident-postmortem': daysAgo(8, 6, 5),
  };

  for (const skill of parsed) {
    const publishedAt = publishedAtBySlug[skill.slug] ?? daysAgo(7, 4, 0);
    run(
      `INSERT OR IGNORE INTO skills (slug, name, description, tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      skill.slug,
      skill.name,
      skill.description,
      JSON.stringify(skill.tags),
      daysAgo(20, 2, 0),
      publishedAt,
    );
    const previous = PREVIOUS_VERSIONS[skill.slug];
    if (previous) {
      insertVersion(skill, previous, daysAgo(20, 2, 0), 'teamai-admin');
    }
    insertVersion(skill, skill.version, publishedAt, 'teamai-admin');
    addEvent({
      type: 'skill.published',
      actor: 'teamai-admin',
      skillSlug: skill.slug,
      version: skill.version,
      action: `发布了 ${skill.name} v${skill.version}`,
      createdAt: publishedAt,
    });
  }

  const projects = [
    {
      id: 'marketing-site',
      name: 'Marketing Site',
      repoUrl: 'https://github.com/hdatsf/marketing-site',
      createdAt: daysAgo(35, 2, 0),
      actor: 'alice',
    },
    {
      id: 'payments-api',
      name: 'Payments API',
      repoUrl: 'https://github.com/hdatsf/payments-api',
      createdAt: daysAgo(28, 3, 0),
      actor: 'bob',
    },
    {
      id: 'data-pipeline',
      name: 'Data Pipeline',
      repoUrl: 'https://github.com/hdatsf/data-pipeline',
      createdAt: daysAgo(21, 4, 0),
      actor: 'carol',
    },
    {
      id: 'hdatsfTeamAITest',
      name: 'HDATSF TeamAI Test',
      repoUrl: 'https://github.com/hdatsf/hdatsfTeamAITest',
      createdAt: daysAgo(2, 2, 0),
      actor: 'hdong',
    },
  ];

  for (const project of projects) {
    run(
      `INSERT OR IGNORE INTO projects (id, name, repo_url, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?)`,
      project.id,
      project.name,
      project.repoUrl,
      project.createdAt,
      project.id === 'hdatsfTeamAITest' ? null : daysAgo(1, 6, 0),
    );
  }

  const latestBySlug = new Map(parsed.map((skill) => [skill.slug, skill.version]));

  const snapshots: Record<string, Array<{ slug: string; version: string; days: number }>> = {
    'marketing-site': [
      { slug: 'code-review', version: PREVIOUS_VERSIONS['code-review'], days: 4 },
      { slug: 'api-design', version: latestBySlug.get('api-design')!, days: 4 },
      { slug: 'release-notes', version: latestBySlug.get('release-notes')!, days: 4 },
    ],
    'payments-api': [
      { slug: 'code-review', version: latestBySlug.get('code-review')!, days: 2 },
      { slug: 'api-design', version: latestBySlug.get('api-design')!, days: 2 },
      { slug: 'incident-postmortem', version: latestBySlug.get('incident-postmortem')!, days: 2 },
    ],
    'data-pipeline': [
      { slug: 'code-review', version: latestBySlug.get('code-review')!, days: 3 },
      { slug: 'release-notes', version: PREVIOUS_VERSIONS['release-notes'], days: 3 },
    ],
  };

  const syncActors: Record<string, string> = {
    'marketing-site': 'alice',
    'payments-api': 'bob',
    'data-pipeline': 'carol',
  };

  for (const [projectId, skills] of Object.entries(snapshots)) {
    for (const row of skills) {
      const content = renderSkillContent({
        ...parsed.find((skill) => skill.slug === row.slug)!,
        version: row.version,
        publishedAt: publishedAtBySlug[row.slug] ?? daysAgo(7, 4, 0),
        publishedBy: 'teamai-admin',
      });
      run(
        `INSERT OR REPLACE INTO project_skills (project_id, slug, version, sha256, synced_at)
         VALUES (?, ?, ?, ?, ?)`,
        projectId,
        row.slug,
        row.version,
        sha256(content),
        daysAgo(row.days, 6, 30),
      );
    }

    for (const days of [12, 8, 4, 1]) {
      addEvent({
        type: 'sync',
        projectId,
        actor: syncActors[projectId],
        action: '同步团队技能',
        detail: `已安装 ${skills.length} 个技能`,
        durationMs: 180 + days * 7,
        createdAt: daysAgo(days, 6, 30),
        meta: {
          installed: skills.map((row) => ({ slug: row.slug, version: row.version })),
          summary: 'sync complete',
        },
      });
    }
  }

  const invocationPatterns = [
    {
      actor: 'alice',
      projectId: 'marketing-site',
      skillSlug: 'code-review',
      action: '评审了落地页改版 PR',
      every: 2,
    },
    {
      actor: 'alice',
      projectId: 'marketing-site',
      skillSlug: 'release-notes',
      action: '生成了 v2.3.0 发布说明',
      every: 4,
    },
    {
      actor: 'bob',
      projectId: 'payments-api',
      skillSlug: 'api-design',
      action: '设计了退款查询接口',
      every: 2,
    },
    {
      actor: 'bob',
      projectId: 'payments-api',
      skillSlug: 'code-review',
      action: '评审了支付回调重试逻辑',
      every: 3,
    },
    {
      actor: 'carol',
      projectId: 'data-pipeline',
      skillSlug: 'release-notes',
      action: '整理了数据管道 v0.8 发布说明',
      every: 2,
    },
    {
      actor: 'carol',
      projectId: 'data-pipeline',
      skillSlug: 'incident-postmortem',
      action: '复盘了延迟告警事件',
      every: 4,
    },
    {
      actor: 'david',
      projectId: 'payments-api',
      skillSlug: 'incident-postmortem',
      action: '复盘了支付网关超时',
      every: 3,
    },
    {
      actor: 'david',
      projectId: 'marketing-site',
      skillSlug: 'code-review',
      action: '评审了 SEO 元数据改动',
      every: 3,
    },
  ];

  invocationPatterns.forEach((pattern, index) => {
    for (let days = 13; days >= 0; days -= 1) {
      if ((days + index) % pattern.every !== 0) continue;
      addEvent({
        type: 'skill.invoked',
        projectId: pattern.projectId,
        actor: pattern.actor,
        skillSlug: pattern.skillSlug,
        version: latestBySlug.get(pattern.skillSlug),
        action: pattern.action,
        detail: pattern.action,
        durationMs: 40 + ((days * 17 + index * 13) % 90),
        createdAt: daysAgo(days, 2 + (index % 8), (index * 7) % 60),
      });
    }
  });

  run(
    `INSERT INTO meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    'seed_version',
    '2',
  );
}

seedIfNeeded();

export { SEED_USERS };
