import type { Project } from '../types';
import { timeAgo } from '../utils';
import {
  AvatarGroup,
  EmptyState,
  Icon,
  SectionHeading,
  StatusBadge,
} from './ui';

interface Props {
  projects: Project[];
  onOpenProject: (project: Project) => void;
}

export default function Projects({ projects, onOpenProject }: Props) {
  const attention = projects.filter((project) => project.status !== 'current').length;

  return (
    <div className="view">
      <SectionHeading
        eyebrow="MANAGED PROJECTS"
        title="受管项目"
        action={
          <span className="heading-meta">
            {projects.length} 个项目 · {attention} 个需要关注
          </span>
        }
      />

      <div className="onboard-strip">
        <div className="onboard-step">
          <span className="onboard-index">1</span>
          <div>
            <strong>安装插件</strong>
            <code>npm run teamai:install</code>
          </div>
        </div>
        <div className="onboard-arrow">→</div>
        <div className="onboard-step">
          <span className="onboard-index">2</span>
          <div>
            <strong>同步技能</strong>
            <code>npm run teamai:sync</code>
          </div>
        </div>
        <div className="onboard-arrow">→</div>
        <div className="onboard-step">
          <span className="onboard-index">3</span>
          <div>
            <strong>上报使用</strong>
            <code>npm run teamai:track -- --skill code-review</code>
          </div>
        </div>
        <span className="onboard-note">
          <Icon name="terminal" size={16} /> 在受管项目根目录执行
        </span>
      </div>

      {projects.length === 0 ? (
        <EmptyState
          title="还没有项目接入"
          hint="在被管理项目中运行 teamai register 后，这里会显示同步状态与成员使用情况。"
        />
      ) : (
        <div className="panel table-panel">
          <div className="table-scroll">
            <table className="data-table project-table">
              <thead>
                <tr>
                  <th>项目</th>
                  <th>状态</th>
                  <th>最近同步</th>
                  <th>已安装</th>
                  <th>落后</th>
                  <th>成员</th>
                  <th className="align-right">使用 / 7 天</th>
                  <th aria-label="打开详情" />
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => {
                  const highlight = project.id === 'hdatsfTeamAITest';
                  return (
                    <tr
                      key={project.id}
                      className={highlight ? 'row-highlight' : undefined}
                      onClick={() => onOpenProject(project)}
                    >
                      <td>
                        <div className="project-cell">
                          <span className="project-avatar">
                            {project.name.slice(0, 1).toUpperCase()}
                          </span>
                          <div>
                            <div className="project-name">
                              {project.name}
                              {highlight && <span className="demo-pill">演示项目</span>}
                            </div>
                            <div className="project-repo">
                              {project.repoUrl ? (
                                <a
                                  href={project.repoUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  {project.id} <Icon name="external" size={11} />
                                </a>
                              ) : (
                                project.id
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <StatusBadge status={project.status} />
                      </td>
                      <td>
                        <div className="cell-main">{timeAgo(project.lastSyncAt)}</div>
                        <div className="cell-sub">
                          {project.lastSyncBy ? `${project.lastSyncBy} 同步` : '等待首次接入'}
                        </div>
                      </td>
                      <td>
                        <span className="number-chip">{project.installedCount}</span>
                      </td>
                      <td>
                        {project.behind.length === 0 ? (
                          <span className="muted">—</span>
                        ) : (
                          <span className="behind-chip" title={project.behind.map((item) => item.name).join('、')}>
                            {project.behind.length} 个
                          </span>
                        )}
                      </td>
                      <td>
                        <AvatarGroup users={project.users} max={4} />
                      </td>
                      <td className="align-right">
                        <span className="cell-strong">{project.invocations7d}</span>
                      </td>
                      <td className="align-right">
                        <Icon name="arrow" size={15} className="row-arrow" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="footnote">
        <Icon name="clock" size={14} />
        <span>
          同步状态由插件上报；点击任意项目可查看已安装技能版本、落后项与最近事件。
        </span>
      </div>
    </div>
  );
}
