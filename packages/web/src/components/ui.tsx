import { useEffect, type ReactNode } from 'react';
import type { Activity, Project } from '../types';
import {
  avatarClass,
  compactNumber,
  eventLabel,
  formatDay,
  initials,
  timeAgo,
  cx,
} from '../utils';

type IconName =
  | 'overview'
  | 'skills'
  | 'projects'
  | 'usage'
  | 'refresh'
  | 'plus'
  | 'close'
  | 'check'
  | 'alert'
  | 'clock'
  | 'arrow'
  | 'external'
  | 'sync'
  | 'spark'
  | 'publish'
  | 'terminal';

const ICON_PATHS: Record<IconName, ReactNode> = {
  overview: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  skills: (
    <>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3Z" />
      <path d="M18 16l.8 2.2L21 19l-2.2.8L18 22l-.8-2.2L15 19l2.2-.8L18 16Z" />
    </>
  ),
  projects: (
    <>
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H10l2 2h5.5A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-10Z" />
      <path d="M4 10h16" />
    </>
  ),
  usage: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5S14 16 14.5 19" />
      <path d="M16 5.5a3 3 0 0 1 0 5.8" />
      <path d="M17 14.4c2 .5 3.3 1.9 3.7 4.1" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  check: <path d="M4.5 12.5l5 5 10-11" />,
  alert: (
    <>
      <path d="M12 3.5 21 20H3L12 3.5Z" />
      <path d="M12 9v5M12 17.5v.1" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  arrow: <path d="M5 12h14M14 7l5 5-5 5" />,
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4l-9 9" />
      <path d="M18 14v5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 19V8a1.5 1.5 0 0 1 1.5-1.5H10" />
    </>
  ),
  sync: (
    <>
      <path d="M20 11a8 8 0 0 0-14-5.3L4 8" />
      <path d="M4 4v4h4" />
      <path d="M4 13a8 8 0 0 0 14 5.3L20 16" />
      <path d="M20 20v-4h-4" />
    </>
  ),
  spark: <path d="M12 3l2.1 6.9L21 12l-6.9 2.1L12 21l-2.1-6.9L3 12l6.9-2.1L12 3Z" />,
  publish: (
    <>
      <path d="M12 16V4" />
      <path d="M7 9l5-5 5 5" />
      <path d="M5 20h14" />
    </>
  ),
  terminal: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M7 9l3 3-3 3M13 15h4" />
    </>
  ),
};

export function Icon({
  name,
  size = 18,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = 'indigo',
  onClick,
}: {
  label: string;
  value: number | string;
  hint: string;
  icon: IconName;
  tone?: 'indigo' | 'teal' | 'amber' | 'rose';
  onClick?: () => void;
}) {
  const content = (
    <>
      <div className={cx('stat-icon', `tone-${tone}`)}>
        <Icon name={icon} size={19} />
      </div>
      <div className="stat-value">{typeof value === 'number' ? compactNumber(value) : value}</div>
      <div className="stat-label">{label}</div>
      <div className="stat-hint">{hint}</div>
    </>
  );
  return onClick ? (
    <button type="button" className="stat-card stat-card-button" onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className="stat-card">{content}</div>
  );
}

const STATUS_META: Record<Project['status'], { label: string; className: string }> = {
  current: { label: '已同步', className: 'badge-current' },
  behind: { label: '有更新', className: 'badge-behind' },
  never: { label: '待接入', className: 'badge-never' },
};

export function StatusBadge({ status }: { status: Project['status'] }) {
  const meta = STATUS_META[status];
  return (
    <span className={cx('badge', meta.className)}>
      <span className="badge-dot" />
      {meta.label}
    </span>
  );
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={cx('avatar', avatarClass(name), `avatar-${size}`)} title={name}>
      {initials(name)}
    </span>
  );
}

export function AvatarGroup({ users, max = 4 }: { users: string[]; max?: number }) {
  if (users.length === 0) return <span className="muted">—</span>;
  const shown = users.slice(0, max);
  return (
    <span className="avatar-group">
      {shown.map((user) => (
        <Avatar key={user} name={user} size="sm" />
      ))}
      {users.length > max && <span className="avatar avatar-sm avatar-more">+{users.length - max}</span>}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

export function Modal({
  title,
  subtitle,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
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

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className={cx('modal', wide && 'modal-wide')} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <h3>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭">
            <Icon name="close" size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="empty">
      <div className="empty-mark">
        <Icon name="projects" size={22} />
      </div>
      <strong>{title}</strong>
      {hint && <p>{hint}</p>}
    </div>
  );
}

export function ActivityItem({ event, showProject = true }: { event: Activity; showProject?: boolean }) {
  const iconName =
    event.type === 'sync'
      ? 'sync'
      : event.type === 'skill.published'
        ? 'publish'
        : event.type === 'skill.invoked'
          ? 'spark'
          : 'terminal';
  const tone =
    event.type === 'sync'
      ? 'tone-teal'
      : event.type === 'skill.published'
        ? 'tone-amber'
        : event.type === 'skill.invoked'
          ? 'tone-indigo'
          : 'tone-rose';

  let title: ReactNode;
  if (event.type === 'sync') {
    title = (
      <>
        <strong>{event.actor}</strong>
        {showProject && event.projectName ? (
          <>
            {' '}
            同步了 <span className="activity-target">{event.projectName}</span>
          </>
        ) : (
          ' 同步了团队技能'
        )}
      </>
    );
  } else if (event.type === 'skill.published') {
    title = (
      <>
        <strong>{event.actor}</strong> 发布了{' '}
        <span className="activity-target">{event.skillName ?? event.skillSlug}</span>
        {event.version && <span className="version-pill">v{event.version}</span>}
      </>
    );
  } else if (event.type === 'skill.invoked') {
    title = (
      <>
        <strong>{event.actor}</strong>
        {showProject && event.projectName ? (
          <>
            {' '}
            在 <span className="activity-target">{event.projectName}</span>
          </>
        ) : null}{' '}
        使用了 <span className="activity-target">{event.skillName ?? event.skillSlug}</span>
        {event.version && <span className="version-pill">v{event.version}</span>}
      </>
    );
  } else {
    title = (
      <>
        <strong>{event.actor}</strong> 触发了 {eventLabel(event.type)}
        {event.skillName && <> · {event.skillName}</>}
      </>
    );
  }

  return (
    <div className="activity-item">
      <div className={cx('activity-icon', tone)}>
        <Icon name={iconName} size={16} />
      </div>
      <div className="activity-body">
        <div className="activity-title">{title}</div>
        {event.detail && event.detail !== event.action && (
          <div className="activity-detail">{event.detail}</div>
        )}
        {event.type === 'sync' && event.action && event.action !== '同步团队技能' && (
          <div className="activity-detail">{event.action}</div>
        )}
      </div>
      <time className="activity-time" title={new Date(event.createdAt).toLocaleString('zh-CN')}>
        {timeAgo(event.createdAt)}
      </time>
    </div>
  );
}

export function TrendChart({
  data,
  height = 210,
  showSyncs = true,
}: {
  data: Array<{ date: string; syncs: number; invocations: number }>;
  height?: number;
  showSyncs?: boolean;
}) {
  const width = 760;
  const padding = { top: 14, right: 12, bottom: 28, left: 34 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const max = Math.max(1, ...data.flatMap((item) => [item.syncs, item.invocations]));
  const groupWidth = innerWidth / Math.max(data.length, 1);
  const barWidth = Math.min(9, Math.max(3, groupWidth * 0.26));
  const gap = Math.max(2, groupWidth * 0.06);
  const yTicks = 4;
  const labelEvery = Math.max(1, Math.ceil(data.length / 7));

  return (
    <div className="chart-wrap">
      <div className="chart-legend">
        <span>
          <i className="legend-dot legend-invocations" /> 技能使用
        </span>
        {showSyncs && (
          <span>
            <i className="legend-dot legend-syncs" /> 同步次数
          </span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="trend-chart"
        role="img"
        aria-label="最近使用趋势"
      >
        {Array.from({ length: yTicks + 1 }, (_, index) => {
          const value = Math.round((max / yTicks) * index);
          const y = padding.top + innerHeight - (value / max) * innerHeight;
          return (
            <g key={index}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={y}
                y2={y}
                className={index === 0 ? 'chart-axis' : 'chart-grid'}
              />
              <text x={padding.left - 8} y={y + 4} textAnchor="end" className="chart-label">
                {value}
              </text>
            </g>
          );
        })}
        {data.map((item, index) => {
          const groupX = padding.left + index * groupWidth + groupWidth / 2;
          const syncHeight = (item.syncs / max) * innerHeight;
          const usageHeight = (item.invocations / max) * innerHeight;
          return (
            <g key={item.date}>
              <title>{`${item.date} · 使用 ${item.invocations} · 同步 ${item.syncs}`}</title>
              <rect
                x={groupX - barWidth - gap / 2}
                y={padding.top + innerHeight - usageHeight}
                width={barWidth}
                height={Math.max(item.invocations > 0 ? 2 : 0, usageHeight)}
                rx={2}
                className="bar-invocations"
              />
              {showSyncs && (
                <rect
                  x={groupX + gap / 2}
                  y={padding.top + innerHeight - syncHeight}
                  width={barWidth}
                  height={Math.max(item.syncs > 0 ? 2 : 0, syncHeight)}
                  rx={2}
                  className="bar-syncs"
                />
              )}
              {index % labelEvery === 0 && (
                <text
                  x={groupX}
                  y={height - 8}
                  textAnchor="middle"
                  className="chart-label chart-x-label"
                >
                  {formatDay(item.date)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function BarList({
  items,
  emptyHint,
  tone = 'indigo',
}: {
  items: Array<{ key: string; label: string; value: number; hint?: string }>;
  emptyHint: string;
  tone?: 'indigo' | 'teal';
}) {
  if (items.length === 0) return <p className="muted small">{emptyHint}</p>;
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <div className="bar-list">
      {items.map((item) => (
        <div className="bar-row" key={item.key}>
          <div className="bar-row-head">
            <span>{item.label}</span>
            <span className="bar-value">
              {item.value}
              {item.hint && <em>{item.hint}</em>}
            </span>
          </div>
          <div className="bar-track">
            <div
              className={cx('bar-fill', tone === 'teal' && 'bar-fill-teal')}
              style={{ width: `${Math.max(3, (item.value / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function RefreshButton({ onClick, busy }: { onClick: () => void; busy?: boolean }) {
  return (
    <button type="button" className="button button-ghost" onClick={onClick} disabled={busy}>
      <Icon name="refresh" size={16} className={busy ? 'spin' : undefined} />
      刷新
    </button>
  );
}
