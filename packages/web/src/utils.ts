export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '从未';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 45) return '刚刚';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} 分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} 小时前`;
  if (seconds < 86400 * 30) return `${Math.floor(seconds / 86400)} 天前`;
  return formatDate(iso);
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatDay(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${Number(parts[1])}/${Number(parts[2])}`;
}

export function compactNumber(value: number): string {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}w`;
  return new Intl.NumberFormat('zh-CN').format(value);
}

export function initials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '?';
  if (/^[\u4e00-\u9fa5]+$/.test(trimmed)) return trimmed.slice(0, 1);
  const parts = trimmed.split(/[\s._-]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : trimmed.slice(0, 2)).toUpperCase();
}

const AVATAR_COLORS = [
  'avatar-indigo',
  'avatar-teal',
  'avatar-amber',
  'avatar-rose',
  'avatar-sky',
  'avatar-violet',
];

export function avatarClass(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) % 997;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export function eventLabel(type: string): string {
  switch (type) {
    case 'sync':
      return '同步';
    case 'skill.invoked':
      return '使用技能';
    case 'skill.published':
      return '发布技能';
    case 'skill.viewed':
      return '查看技能';
    case 'agent.run':
      return 'Agent 运行';
    default:
      return type;
  }
}
