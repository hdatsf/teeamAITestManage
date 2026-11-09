import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import type { Project, ProjectDetail } from '../types';
import { formatDate, timeAgo } from '../utils';
import {
  ActivityItem,
  Avatar,
  Icon,
  SectionHeading,
  StatusBadge,
} from './ui';

interface Props {
  project: Project;
  onClose: () => void;
}

export default function ProjectDrawer({ project, onClose }: Props) {
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setDetail(null);
    setError(null);
    api
      .project(project.id)
      .then((data) => {
        if (active) setDetail(data);
      })
      .catch((requestError) => {
        if (active) {
          setError(
            requestError instanceof ApiError
              ? requestError.message
              : requestError instanceof Error
                ? requestError.message
                : '加载失败',
          );
        }
      });
    return () => {
      active = false;
    };
  }, [project.id]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const current = detail?.project ?? project;

  return (
    <div
      className="drawer-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <aside className="drawer" role="dialog" aria-modal="true" aria-label={`${project.name} 详情`}>
        <header className="drawer-head">
          <div className="drawer-title">
            <div className="project-avatar project-avatar-lg">
              {project.name.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <h2>{project.name}</h2>
              <div className="drawer-sub">
                <code>{project.id}</code>
                <StatusBadge status={current.status} />
              </div>
            </div>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭">
            <Icon name="close" size={19} />
          </button>
        </header>

        <div className="drawer-body">
          {project.repoUrl && (
            <a className="repo-link" href={project.repoUrl} target="_blank" rel="noreferrer">
              <Icon name="external" size={14} /> {project.repoUrl.replace(/^https?:\/\//, '')}
            </a>
          )}

          <div className="drawer-metrics">
            <div>
              <span>最近同步</span>
              <strong>{timeAgo(current.lastSyncAt)}</strong>
              <small>{formatDate(current.lastSyncAt)}</small>
            </div>
            <div>
              <span>已安装技能</span>
              <strong>{current.installedCount}</strong>
              <small>{current.behind.length} 个落后</small>
            </div>
            <div>
              <span>同步 / 7 天</span>
              <strong>{current.syncs7d}</strong>
              <small>插件上报</small>
            </div>
            <div>
              <span>使用 / 7 天</span>
              <strong>{current.invocations7d}</strong>
              <small>技能调用</small>
            </div>
          </div>

          <div className="drawer-section">
            <SectionHeading eyebrow="MEMBERS" title="参与成员" />
            {current.users.length > 0 ? (
              <div className="member-list">
                {current.users.map((user) => (
                  <span className="member-chip" key={user}>
                    <Avatar name={user} size="sm" /> {user}
                  </span>
                ))}
              </div>
            ) : (
              <p className="muted small">还没有成员上报事件。</p>
            )}
          </div>

          <div className="drawer-section">
            <SectionHeading eyebrow="SKILLS" title="已安装技能" />
            {!detail && !error && <div className="skeleton-lines" />}
            {error && <p className="form-error">{error}</p>}
            {detail && detail.installed.length === 0 && (
              <div className="drawer-callout">
                <Icon name="terminal" size={17} />
                <div>
                  <strong>该项目尚未同步技能</strong>
                  <p>
                    在项目根目录执行 <code>npm run teamai:sync</code>，随后这里会显示版本与校验信息。
                  </p>
                </div>
              </div>
            )}
            {detail && detail.installed.length > 0 && (
              <div className="installed-list">
                {detail.installed.map((item) => (
                  <div className="installed-row" key={item.slug}>
                    <div>
                      <span className="installed-name">{item.name}</span>
                      <code>{item.slug}</code>
                    </div>
                    <div className="installed-version">
                      <span className={item.current ? 'version-current' : 'version-behind'}>
                        v{item.version}
                      </span>
                      {!item.current && <small>最新 v{item.latestVersion}</small>}
                    </div>
                    <span className="installed-time">{timeAgo(item.syncedAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="drawer-section">
            <SectionHeading eyebrow="EVENTS" title="最近事件" />
            {!detail && !error && <div className="skeleton-lines" />}
            {detail && detail.events.length === 0 && (
              <p className="muted small">暂无事件记录。</p>
            )}
            {detail && (
              <div className="activity-list">
                {detail.events.slice(0, 12).map((event) => (
                  <ActivityItem key={event.id} event={event} showProject={false} />
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
