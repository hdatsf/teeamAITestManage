import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { DB_PATH, ROOT, all } from './db.js';
import {
  getActivity,
  getOverview,
  getProjectDetail,
  getProjects,
  getSkillViews,
  getUsage,
  httpError,
  ingestEvents,
  publishSkill,
  registerProject,
  type HttpError,
} from './store.js';

const PORT = Number(process.env.PORT ?? process.env.TEAMAI_PORT ?? 4310);
const HOST = process.env.TEAMAI_HOST ?? '127.0.0.1';
const ADMIN_TOKEN = process.env.TEAMAI_ADMIN_TOKEN ?? 'teamai-admin-local';
const INGEST_TOKEN = process.env.TEAMAI_INGEST_TOKEN ?? 'teamai-demo-token';
const PLUGIN_PATH = path.join(ROOT, 'packages/plugin/teamai.mjs');
const WEB_DIST = path.join(ROOT, 'packages/web/dist');
const PLUGIN_VERSION = JSON.parse(
  readFileSync(path.join(ROOT, 'packages/plugin/package.json'), 'utf8'),
).version as string;

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type, x-teamai-admin, x-teamai-token');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

function readAdminToken(req: Request): string {
  const header = req.get('x-teamai-admin');
  if (header) return header;
  const auth = req.get('authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : '';
}

function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (readAdminToken(req) !== ADMIN_TOKEN) {
    next(httpError(401, 'UNAUTHORIZED', '需要管理端令牌（x-teamai-admin）'));
    return;
  }
  next();
}

function requireIngest(req: Request, _res: Response, next: NextFunction) {
  if (req.get('x-teamai-token') !== INGEST_TOKEN) {
    next(httpError(401, 'UNAUTHORIZED', '需要项目接入令牌（x-teamai-token）'));
    return;
  }
  next();
}

app.get('/api/v1/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'teamai-control-plane',
    time: new Date().toISOString(),
    database: path.relative(ROOT, DB_PATH),
    pluginVersion: PLUGIN_VERSION,
  });
});

app.get('/api/v1/overview', (req, res, next) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days ?? 14), 1), 90);
    res.json(getOverview(days));
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/skills', (_req, res, next) => {
  try {
    res.json({ items: getSkillViews(7) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/skills/:slug', (req, res, next) => {
  try {
    const skill = getSkillViews(7).find((row) => row.slug === req.params.slug);
    if (!skill) throw httpError(404, 'SKILL_NOT_FOUND', '技能不存在');
    const versions = all<{
      version: string;
      publishedAt: string;
      publishedBy: string;
      sha256: string;
    }>(
      `SELECT version, published_at AS publishedAt, published_by AS publishedBy, sha256
       FROM skill_versions WHERE slug = ?
       ORDER BY published_at DESC, id DESC`,
      req.params.slug,
    );
    res.json({ ...skill, versions });
  } catch (error) {
    next(error);
  }
});

app.post('/api/v1/skills', requireAdmin, (req, res, next) => {
  try {
    const result = publishSkill(req.body ?? {});
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/projects', (_req, res, next) => {
  try {
    res.json({ items: getProjects() });
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/projects/:id', (req, res, next) => {
  try {
    const detail = getProjectDetail(req.params.id);
    if (!detail) throw httpError(404, 'PROJECT_NOT_FOUND', '项目不存在');
    res.json(detail);
  } catch (error) {
    next(error);
  }
});

app.post('/api/v1/projects/register', requireIngest, (req, res, next) => {
  try {
    const project = registerProject(req.body ?? {});
    res.json({ project });
  } catch (error) {
    next(error);
  }
});

app.post('/api/v1/events', requireIngest, (req, res, next) => {
  try {
    const result = ingestEvents(req.body ?? {});
    res.status(202).json(result);
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/activity', (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 40), 1), 200);
    res.json({ items: getActivity(limit) });
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/usage', (req, res, next) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days ?? 30), 1), 180);
    res.json(getUsage(days));
  } catch (error) {
    next(error);
  }
});

app.get('/api/v1/plugin/teamai.mjs', (_req, res) => {
  if (!existsSync(PLUGIN_PATH)) {
    res.status(404).json({ error: { code: 'PLUGIN_NOT_FOUND', message: '插件文件不存在' } });
    return;
  }
  res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-TeamAI-Plugin-Version', PLUGIN_VERSION);
  res.sendFile(PLUGIN_PATH);
});

app.get('/api/v1/plugin/meta', (_req, res) => {
  const source = existsSync(PLUGIN_PATH) ? readFileSync(PLUGIN_PATH) : Buffer.from('');
  res.json({
    version: PLUGIN_VERSION,
    sha256: createHash('sha256').update(source).digest('hex'),
    downloadUrl: '/api/v1/plugin/teamai.mjs',
  });
});

if (existsSync(WEB_DIST)) {
  app.use(express.static(WEB_DIST));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) {
      next();
      return;
    }
    res.sendFile(path.join(WEB_DIST, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.type('text/plain').send(
      'TeamAI control plane API is running. Start the dashboard with `npm run dev` (Vite on :5173) or build with `npm run build`.',
    );
  });
}

app.use((_req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
});

app.use((error: HttpError, _req: Request, res: Response, _next: NextFunction) => {
  const status = Number(error.status ?? 500);
  if (status >= 500) console.error(error);
  res.status(status).json({
    error: {
      code: error.code ?? 'INTERNAL_ERROR',
      message: error.message ?? 'Internal server error',
    },
  });
});

app.listen(PORT, HOST, () => {
  console.log(`TeamAI API listening on http://${HOST}:${PORT}`);
  console.log(`Database: ${DB_PATH}`);
  console.log(`Admin token: ${ADMIN_TOKEN}`);
  console.log(`Ingest token: ${INGEST_TOKEN}`);
});
