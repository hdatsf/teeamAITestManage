import type { Overview as OverviewData, Project } from '../types';
import { timeAgo, cx } from '../utils';
import {
  ActivityItem,
  AvatarGroup,
  BarList,
  Icon,
  SectionHeading,
  StatCard,
  StatusBadge,
  TrendChart,
} from './ui';

interface Props {
  data: OverviewData;
  onOpenProject: (project: Project) => void;
  onNavigate: (tab: 'skills' | 'projects' | 'usage') => void;
  onPublish: () => void;
}

export default function Overview({ data, onOpenProject, onNavigate, onPublish }: Props) {
  const { totals, series, projects, skills, recent } = data;
  const attention = [...projects].sort((a, b) => {
    const order = { behind: 0, never: 1, current: 2 } as const;
    return order[a.status] - order[b.status] || a.name.localeCompare(b.name);
  });
  const adoption = [...skills].sort(
    (a, b) => b.stats.invocations7d - a.stats.invocations7d,
  );

  return (
    <div className="view">
      <div className="stats-grid">
        <StatCard
          label="受管项目"
          value={totals.projects}
          hint={`${totals.behindProjects} 个需要关注`}
          icon="projects"
          tone="indigo"
          onClick={() => onNavigate('projects')}
        />
        <StatCard
          label="已发布技能"
          value={totals.skills}
          hint="团队统一分发"
          icon="skills"
          tone="amber"
          onClick={() => onNavigate('skills')}
        />
        <StatCard
          label="技能使用 · 7 天"
          value={totals.invocations7d}
          hint={`同步 ${totals.syncs7d} 次`}
          icon="spark"
          tone="teal"
          onClick={() => onNavigate('usage')}
        />
        <StatCard
          label="活跃成员 · 7 天"
          value={totals.activeUsers7d}
          hint="来自全部受管项目"
          icon="usage"
          tone="rose"
          onClick={() => onNavigate('usage')}
        />
      </div>

      <div className="overview-grid">
        <section className="panel panel-wide">
          <SectionHeading
            eyebrow="ACTIVITY"
            title="使用趋势"
            action={
              <button type="button" className="text-button" onClick={() => onNavigate('usage')}>
                查看明细 <Icon name="arrow" size={14} />
              </button>
            }
          />
          <TrendChart data={series} />
        </section>

        <section className="panel">
          <SectionHeading
            eyebrow="ADOPTION"
            title="技能采用"
            action={
              <button type="button" className="text-button" onClick={() => onNavigate('skills')}>
                全部 <Icon name="arrow" size={14} />
              </button>
            }
          />
          <div className="adoption-list">
            {adoption.map((skill) => {
              const ratio =
                skill.stats.projects === 0
                  ? 0
                  : Math.round((skill.stats.projectsCurrent / skill.stats.projects) * 100);
              return (
                <button
                  type="button"
                  className="adoption-row"
                  key={skill.slug}
                  onClick={() => onNavigate('skills')}
                >
                  <div className="adoption-head">
                    <span className="adoption-name">{skill.name}</span>
                    <span className="adoption-version">v{skill.version}</span>
                  </div>
                  <div className="adoption-meta">
                    <span>{skill.stats.invocations7d} 次使用 / 7 天</span>
                    <span className={cx('adoption-ratio', ratio === 100 && 'is-full')}>
                      {skill.stats.projectsCurrent}/{skill.stats.projects} 项目最新
                    </span>
                  </div>
                  <div className="adoption-track">
                    <div className="adoption-fill" style={{ width: `${ratio}%` }} />
                  </div>
                </button>
              );
            })}
            {adoption.length === 0 && <p className="muted small">还没有发布技能。</p>}
          </div>
          <button type="button" className="button button-soft button-full" onClick={onPublish}>
            <Icon name="plus" size={16} /> 发布新技能
          </button>
        </section>

        <section className="panel">
          <SectionHeading
            eyebrow="SYNC HEALTH"
            title="项目同步状态"
            action={
              <button type="button" className="text-button" onClick={() => onNavigate('projects')}>
                全部 <Icon name="arrow" size={14} />
              </button>
            }
          />
          <div className="project-mini-list">
            {attention.slice(0, 5).map((project) => (
              <button
                type="button"
                className="project-mini"
                key={project.id}
                onClick={() => onOpenProject(project)}
              >
                <span className={cx('project-dot', `dot-${project.status}`)} />
                <span className="project-mini-main">
                  <span className="project-mini-name">{project.name}</span>
                  <span className="project-mini-sub">
                    {project.lastSyncAt
                      ? `${timeAgo(project.lastSyncAt)} · ${project.lastSyncBy ?? '未知'} 同步`
                      : '尚未执行 teamai sync'}
                  </span>
                </span>
                <span className="project-mini-side">
                  <StatusBadge status={project.status} />
                  <span className="project-mini-users">
                    <AvatarGroup users={project.users} max={3} />
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="panel">
          <SectionHeading eyebrow="TREND" title="团队热度" />
          <BarList
            items={adoption.slice(0, 5).map((skill) => ({
              key: skill.slug,
              label: skill.name,
              value: skill.stats.invocations7d,
              hint: '次 / 7 天',
            }))}
            emptyHint="暂无使用记录。"
          />
          <div className="insight-callout">
            <Icon name="spark" size={16} />
            <span>
              {totals.behindProjects > 0
                ? `有 ${totals.behindProjects} 个项目尚未拉到最新技能，提醒对应负责人执行 teamai sync。`
                : '所有已接入项目都使用最新技能版本。'}
            </span>
          </div>
        </section>

        <section className="panel panel-wide">
          <SectionHeading
            eyebrow="LIVE FEED"
            title="最近动态"
            action={
              <button type="button" className="text-button" onClick={() => onNavigate('usage')}>
                更多 <Icon name="arrow" size={14} />
              </button>
            }
          />
          <div className="activity-list">
            {recent.slice(0, 8).map((event) => (
              <ActivityItem key={event.id} event={event} />
            ))}
            {recent.length === 0 && <p className="muted small">还没有活动记录。</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
