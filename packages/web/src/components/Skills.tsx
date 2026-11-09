import { useMemo, useState } from 'react';
import type { Skill } from '../types';
import { formatDate, timeAgo, cx } from '../utils';
import { EmptyState, Icon, Modal, SectionHeading } from './ui';

interface Props {
  skills: Skill[];
  onPublish: (skill?: Skill) => void;
}

export default function Skills({ skills, onPublish }: Props) {
  const [query, setQuery] = useState('');
  const [viewing, setViewing] = useState<Skill | null>(null);
  const [copied, setCopied] = useState(false);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return skills;
    return skills.filter(
      (skill) =>
        skill.name.toLowerCase().includes(keyword) ||
        skill.slug.includes(keyword) ||
        skill.description.toLowerCase().includes(keyword) ||
        skill.tags.some((tag) => tag.toLowerCase().includes(keyword)),
    );
  }, [skills, query]);

  async function copyContent() {
    if (!viewing) return;
    try {
      await navigator.clipboard.writeText(viewing.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="view">
      <SectionHeading
        eyebrow="SKILL LIBRARY"
        title="团队技能库"
        action={
          <div className="heading-actions">
            <label className="search">
              <Icon name="skills" size={15} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="搜索技能 / 标签"
                aria-label="搜索技能"
              />
            </label>
          </div>
        }
      />

      <div className="distribution-strip">
        <div className="distribution-icon">
          <Icon name="sync" size={20} />
        </div>
        <div>
          <strong>一处发布，多项目同步</strong>
          <p>
            管理端发布新版本后，被管理项目执行 <code>npm run teamai:sync</code> 即可拉到最新技能，并自动回传同步状态。
          </p>
        </div>
        <span className="distribution-count">{skills.length} 个技能</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="没有匹配的技能" hint="换个关键词，或发布一个新的团队技能。" />
      ) : (
        <div className="skill-grid">
          {filtered.map((skill) => {
            const ratio =
              skill.stats.projects === 0
                ? 0
                : Math.round((skill.stats.projectsCurrent / skill.stats.projects) * 100);
            return (
              <article className="skill-card" key={skill.slug}>
                <div className="skill-card-head">
                  <div className="skill-mark">
                    <Icon name="spark" size={18} />
                  </div>
                  <div className="skill-title">
                    <h3>{skill.name}</h3>
                    <code>{skill.slug}</code>
                  </div>
                  <span className="version-pill version-pill-lg">v{skill.version}</span>
                </div>
                <p className="skill-description">{skill.description || '暂无描述'}</p>
                <div className="tag-row">
                  {skill.tags.map((tag) => (
                    <span className="tag" key={tag}>
                      #{tag}
                    </span>
                  ))}
                  {skill.tags.length === 0 && <span className="muted small">无标签</span>}
                </div>
                <div className="skill-stats">
                  <div>
                    <strong>{skill.stats.invocations7d}</strong>
                    <span>次使用 / 7 天</span>
                  </div>
                  <div>
                    <strong>
                      {skill.stats.projectsCurrent}/{skill.stats.projects}
                    </strong>
                    <span>项目已更新</span>
                  </div>
                  <div>
                    <strong>{timeAgo(skill.publishedAt)}</strong>
                    <span>发布</span>
                  </div>
                </div>
                <div className="skill-adoption">
                  <div className={cx('skill-adoption-fill', ratio === 100 && 'is-full')} style={{ width: `${ratio}%` }} />
                </div>
                <div className="skill-card-foot">
                  <span className="muted small">更新于 {formatDate(skill.updatedAt)}</span>
                  <div className="card-actions">
                    <button type="button" className="text-button" onClick={() => setViewing(skill)}>
                      查看内容
                    </button>
                    <button type="button" className="button button-soft button-sm" onClick={() => onPublish(skill)}>
                      <Icon name="publish" size={14} /> 发布新版本
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {viewing && (
        <Modal
          title={viewing.name}
          subtitle={`${viewing.slug} · v${viewing.version} · ${viewing.publishedBy}`}
          onClose={() => setViewing(null)}
          wide
        >
          <div className="skill-viewer">
            <pre>{viewing.content}</pre>
            <div className="modal-actions">
              <span className="muted small">SHA-256 {viewing.sha256.slice(0, 16)}…</span>
              <div className="button-row">
                <button type="button" className="button button-ghost" onClick={copyContent}>
                  {copied ? '已复制' : '复制 SKILL.md'}
                </button>
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => {
                    setViewing(null);
                    onPublish(viewing);
                  }}
                >
                  发布新版本
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
