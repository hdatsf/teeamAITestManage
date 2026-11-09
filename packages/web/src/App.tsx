import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import Overview from './components/Overview';
import ProjectDrawer from './components/ProjectDrawer';
import Projects from './components/Projects';
import PublishModal from './components/PublishModal';
import Skills from './components/Skills';
import Usage from './components/Usage';
import { Icon, RefreshButton } from './components/ui';
import type { Overview as OverviewData, Project, Skill, Usage as UsageData } from './types';
import { cx, formatDate } from './utils';

type Tab = 'overview' | 'skills' | 'projects' | 'usage';

const TABS: Array<{ id: Tab; label: string; icon: 'overview' | 'skills' | 'projects' | 'usage' }> = [
  { id: 'overview', label: '总览', icon: 'overview' },
  { id: 'skills', label: '技能库', icon: 'skills' },
  { id: 'projects', label: '项目', icon: 'projects' },
  { id: 'usage', label: '使用情况', icon: 'usage' },
];

const HEADINGS: Record<Tab, { eyebrow: string; title: string; subtitle: string }> = {
  overview: {
    eyebrow: 'TEAM OPERATIONS',
    title: '总览',
    subtitle: '团队技能的分发、采用与使用全景。',
  },
  skills: {
    eyebrow: 'SKILL LIBRARY',
    title: '技能库',
    subtitle: '一处发布，被管理项目同步生效。',
  },
  projects: {
    eyebrow: 'MANAGED PROJECTS',
    title: '项目',
    subtitle: '接入状态、技能版本与同步健康度。',
  },
  usage: {
    eyebrow: 'TEAM INSIGHTS',
    title: '使用情况',
    subtitle: '谁在使用哪些技能，以及活跃趋势。',
  },
};

export default function App() {
  const [tab, setTab] = useState<Tab>('overview');
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [publishTarget, setPublishTarget] = useState<Skill | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  const [drawerProject, setDrawerProject] = useState<Project | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async (mode: 'initial' | 'manual' | 'auto' = 'auto') => {
    if (mode === 'manual') setRefreshing(true);
    try {
      const [nextOverview, nextUsage] = await Promise.all([api.overview(14), api.usage(30)]);
      setOverview(nextOverview);
      setUsage(nextUsage);
      setError(null);
      setLastUpdated(new Date());
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : '无法连接 TeamAI 控制平面，请确认管理端服务已启动。',
      );
    } finally {
      setLoading(false);
      if (mode === 'manual') setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load('initial');
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load('auto');
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const openPublish = useCallback((skill?: Skill) => {
    setPublishTarget(skill ?? null);
    setPublishOpen(true);
  }, []);

  const onPublished = useCallback(
    (message: string) => {
      setToast(message);
      void load('manual');
    },
    [load],
  );

  const counts = useMemo(
    () => ({
      projects: overview?.totals.projects ?? 0,
      skills: overview?.totals.skills ?? 0,
      attention: overview?.totals.behindProjects ?? 0,
    }),
    [overview],
  );

  if (loading) {
    return (
      <div className="boot-screen">
        <div className="boot-logo">
          <Icon name="spark" size={26} />
        </div>
        <div className="boot-title">TeamAI</div>
        <div className="boot-sub">正在连接控制平面…</div>
        <div className="boot-bar">
          <span />
        </div>
      </div>
    );
  }

  if (!overview || !usage) {
    return (
      <div className="boot-screen">
        <div className="boot-logo boot-logo-error">
          <Icon name="alert" size={26} />
        </div>
        <div className="boot-title">无法加载看板</div>
        <div className="boot-sub">
          {error ?? '控制平面未响应。请先在管理仓运行 npm run dev。'}
        </div>
        <button type="button" className="button button-primary" onClick={() => void load('manual')}>
          重试连接
        </button>
      </div>
    );
  }

  const heading = HEADINGS[tab];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Icon name="spark" size={19} />
          </div>
          <div>
            <div className="brand-name">TeamAI</div>
            <div className="brand-sub">Control Plane</div>
          </div>
        </div>

        <nav className="nav">
          <div className="nav-label">工作台</div>
          {TABS.map((item) => (
            <button
              type="button"
              key={item.id}
              className={cx('nav-item', tab === item.id && 'active')}
              onClick={() => setTab(item.id)}
            >
              <Icon name={item.icon} size={17} />
              <span>{item.label}</span>
              {item.id === 'skills' && <span className="nav-count">{counts.skills}</span>}
              {item.id === 'projects' && <span className="nav-count">{counts.projects}</span>}
              {item.id === 'projects' && counts.attention > 0 && (
                <span className="nav-alert" title={`${counts.attention} 个项目需要关注`} />
              )}
            </button>
          ))}
        </nav>

        <div className="sidebar-card">
          <div className="sidebar-card-title">
            <span className="live-dot" /> 控制平面在线
          </div>
          <p>受管项目通过 TeamAI 插件同步技能并回传使用事件。</p>
          <div className="sidebar-meta">
            <span>API</span>
            <code>localhost:4310</code>
          </div>
          <div className="sidebar-meta">
            <span>刷新</span>
            <code>15s</code>
          </div>
        </div>

        <div className="sidebar-foot">
          <span className="avatar avatar-sm avatar-indigo">TA</span>
          <div>
            <div className="sidebar-foot-name">Team Admin</div>
            <div className="sidebar-foot-sub">teamai-admin</div>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <div className="eyebrow">{heading.eyebrow}</div>
            <h1>{heading.title}</h1>
            <p>{heading.subtitle}</p>
          </div>
          <div className="topbar-actions">
            <span className="last-updated">
              <span className="live-dot" />
              {lastUpdated ? `更新于 ${lastUpdated.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : '连接中'}
            </span>
            <RefreshButton onClick={() => void load('manual')} busy={refreshing} />
            <button type="button" className="button button-primary" onClick={() => openPublish()}>
              <Icon name="plus" size={16} /> 发布技能
            </button>
          </div>
        </header>

        {error && (
          <div className="error-banner">
            <Icon name="alert" size={16} />
            <span>{error} 正在显示最近一次成功加载的数据。</span>
          </div>
        )}

        <div className="content">
          {tab === 'overview' && (
            <Overview
              data={overview}
              onOpenProject={setDrawerProject}
              onNavigate={setTab}
              onPublish={() => openPublish()}
            />
          )}
          {tab === 'skills' && <Skills skills={overview.skills} onPublish={openPublish} />}
          {tab === 'projects' && (
            <Projects projects={overview.projects} onOpenProject={setDrawerProject} />
          )}
          {tab === 'usage' && <Usage usage={usage} recent={overview.recent} />}
        </div>

        <footer className="main-footer">
          <span>TeamAI Control Plane · demo dataset</span>
          <span>数据时间 {formatDate(lastUpdated?.toISOString() ?? null)}</span>
        </footer>
      </main>

      {publishOpen && (
        <PublishModal
          skill={publishTarget}
          onClose={() => setPublishOpen(false)}
          onPublished={onPublished}
        />
      )}

      {drawerProject && (
        <ProjectDrawer project={drawerProject} onClose={() => setDrawerProject(null)} />
      )}

      {toast && (
        <div className="toast" role="status">
          <Icon name="check" size={16} /> {toast}
        </div>
      )}
    </div>
  );
}
