import { useState } from 'react';
import { api, ApiError } from '../api';
import type { Skill } from '../types';
import { Icon, Modal } from './ui';

interface Props {
  skill: Skill | null;
  onClose: () => void;
  onPublished: (message: string) => void;
}

function nextPatch(version: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version);
  if (!match) return '1.0.1';
  return `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
}

export default function PublishModal({ skill, onClose, onPublished }: Props) {
  const [slug, setSlug] = useState(skill?.slug ?? '');
  const [name, setName] = useState(skill?.name ?? '');
  const [description, setDescription] = useState(skill?.description ?? '');
  const [tags, setTags] = useState(skill?.tags.join(', ') ?? '');
  const [body, setBody] = useState(skill?.body ?? '');
  const [version, setVersion] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggestedVersion = skill ? nextPatch(skill.version) : '1.0.0';

  async function submit() {
    setError(null);
    if (!slug.trim() || !name.trim() || !body.trim()) {
      setError('slug、名称和技能内容不能为空');
      return;
    }
    setSubmitting(true);
    try {
      const result = await api.publish({
        slug: slug.trim(),
        name: name.trim(),
        description: description.trim(),
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        body,
        version: version.trim() || undefined,
      });
      onPublished(
        `${skill ? '已发布新版本' : '已创建技能'}：${result.skill.name} v${result.publishedVersion}`,
      );
      onClose();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : requestError instanceof Error
            ? requestError.message
            : '发布失败',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      title={skill ? `发布新版本 · ${skill.name}` : '发布新技能'}
      subtitle={
        skill
          ? `当前 v${skill.version}。发布后，受管项目执行 teamai sync 即可更新。`
          : '创建后会立即出现在受管项目的技能同步列表中。'
      }
      onClose={onClose}
      wide
    >
      <div className="publish-form">
        <div className="field-grid">
          <label className="field">
            <span>技能标识 slug</span>
            <input
              value={slug}
              onChange={(event) => setSlug(event.target.value)}
              placeholder="code-review"
              disabled={Boolean(skill)}
              pattern="[a-z0-9][a-z0-9-]*"
            />
            <small>{skill ? 'slug 创建后不可修改' : '小写字母、数字、连字符'}</small>
          </label>
          <label className="field">
            <span>名称</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Code Review"
            />
          </label>
        </div>
        <label className="field">
          <span>一句话描述</span>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="结构化代码评审清单，覆盖正确性、可读性与安全性。"
          />
        </label>
        <div className="field-grid">
          <label className="field">
            <span>标签</span>
            <input
              value={tags}
              onChange={(event) => setTags(event.target.value)}
              placeholder="quality, review, git"
            />
            <small>使用逗号分隔</small>
          </label>
          <label className="field">
            <span>版本号（可选）</span>
            <input
              value={version}
              onChange={(event) => setVersion(event.target.value)}
              placeholder={suggestedVersion}
            />
            <small>留空则自动发布 v{suggestedVersion}</small>
          </label>
        </div>
        <label className="field">
          <span>SKILL.md 正文</span>
          <textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={16}
            placeholder={'# Code Review\n\n## 何时使用\n…'}
          />
          <small>元数据（name/slug/version/tags）由管理端自动写入 frontmatter。</small>
        </label>

        {error && (
          <div className="form-error">
            <Icon name="alert" size={15} /> {error}
          </div>
        )}

        <div className="publish-hint">
          <Icon name="sync" size={16} />
          <span>
            发布后，在 <code>hdatsfTeamAITest</code> 执行 <code>npm run teamai:sync</code> 验证分发；同步记录会实时出现在看板。
          </span>
        </div>

        <div className="modal-actions">
          <span className="muted small">发布者：teamai-admin</span>
          <div className="button-row">
            <button type="button" className="button button-ghost" onClick={onClose} disabled={submitting}>
              取消
            </button>
            <button type="button" className="button button-primary" onClick={submit} disabled={submitting}>
              {submitting ? '发布中…' : skill ? `发布 v${version.trim() || suggestedVersion}` : '创建并发布'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
