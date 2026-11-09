import type { Activity, Usage as UsageData } from '../types';
import { formatDate, timeAgo } from '../utils';
import {
  ActivityItem,
  Avatar,
  BarList,
  EmptyState,
  Icon,
  SectionHeading,
  StatCard,
  TrendChart,
} from './ui';

interface Props {
  usage: UsageData;
  recent: Activity[];
}

export default function Usage({ usage, recent }: Props) {
  const totalInvocations = usage.users.reduce((sum, user) => sum + user.invocations, 0);
  const totalSyncs = usage.users.reduce((sum, user) => sum + user.syncs, 0);
  const topSkill = usage.skills[0];
  const topProject = usage.projects[0];
  const skillNames = new Map(usage.skills.map((skill) => [skill.slug, skill.name]));
  const projectNames = new Map(usage.projects.map((project) => [project.projectId, project.name]));
  const usageEvents = recent.filter((event) => event.type === 'skill.invoked');

  const chartData = usage.daily.map((item) => ({
    date: item.date,
    syncs: 0,
    invocations: item.count,
  }));

  return (
    <div className="view">
      <SectionHeading
        eyebrow="TEAM INSIGHTS"
        title="成员使用情况"
        action={<span className="heading-meta">最近 {usage.days} 天 · 全部受管项目</span>}
      />

      <div className="stats-grid">
        <StatCard
          label="技能使用"
          value={totalInvocations}
          hint={`平均 ${Math.round(totalInvocations / Math.max(usage.days, 1))} 次 / 天`}
          icon="spark"
          tone="indigo"
        />
        <StatCard
          label="活跃成员"
          value={usage.users.length}
          hint={`${usage.projects.length} 个项目参与`}
          icon="usage"
          tone="teal"
        />
        <StatCard
          label="最热技能"
          value={topSkill?.name ?? '—'}
          hint={topSkill ? `${topSkill.count} 次使用` : '暂无数据'}
          icon="skills"
          tone="amber"
        />
        <StatCard
          label="最活跃项目"
          value={topProject?.name ?? '—'}
          hint={topProject ? `${topProject.count} 次技能调用` : '暂无数据'}
          icon="projects"
          tone="rose"
        />
      </div>

      <div className="usage-grid">
        <section className="panel panel-wide">
          <SectionHeading
            eyebrow="VOLUME"
            title="每日技能调用"
            action={<span className="heading-meta">共 {totalSyncs} 次同步</span>}
          />
          <TrendChart data={chartData} showSyncs={false} />
        </section>

        <section className="panel">
          <SectionHeading eyebrow="TOP SKILLS" title="技能热度" />
          <BarList
            items={usage.skills.slice(0, 6).map((skill) => ({
              key: skill.slug,
              label: skill.name,
              value: skill.count,
              hint: '次',
            }))}
            emptyHint="暂无技能使用记录。"
          />
        </section>

        <section className="panel">
          <SectionHeading eyebrow="TOP PROJECTS" title="项目分布" />
          <BarList
            tone="teal"
            items={usage.projects.slice(0, 6).map((project) => ({
              key: project.projectId,
              label: project.name,
              value: project.count,
              hint: '次',
            }))}
            emptyHint="暂无项目使用记录。"
          />
        </section>
      </div>

      <section className="panel table-panel users-panel">
        <SectionHeading eyebrow="MEMBERS" title="成员明细" />
        {usage.users.length === 0 ? (
          <EmptyState title="暂无成员数据" hint="agent 读取技能、或运行 teamai use 后，这里会显示成员使用情况。" />
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>成员</th>
                  <th className="align-right">技能使用</th>
                  <th className="align-right">同步次数</th>
                  <th>参与项目</th>
                  <th>常用技能</th>
                  <th>最近活跃</th>
                </tr>
              </thead>
              <tbody>
                {usage.users.map((user, index) => (
                  <tr key={user.actor}>
                    <td>
                      <div className="member-cell">
                        <span className="member-rank">{index + 1}</span>
                        <Avatar name={user.actor} />
                        <div>
                          <div className="cell-strong">{user.actor}</div>
                          <div className="cell-sub">团队成员</div>
                        </div>
                      </div>
                    </td>
                    <td className="align-right">
                      <span className="cell-strong">{user.invocations}</span>
                    </td>
                    <td className="align-right">{user.syncs}</td>
                    <td>
                      <div className="project-tags">
                        {user.projects.slice(0, 2).map((projectId) => (
                          <span className="tag" key={projectId}>
                            {projectNames.get(projectId) ?? projectId}
                          </span>
                        ))}
                        {user.projects.length > 2 && (
                          <span className="tag tag-more">+{user.projects.length - 2}</span>
                        )}
                      </div>
                    </td>
                    <td>
                      {user.topSkill ? (
                        <span className="top-skill">
                          <Icon name="spark" size={13} />
                          {skillNames.get(user.topSkill) ?? user.topSkill}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <div className="cell-main">{timeAgo(user.lastActive)}</div>
                      <div className="cell-sub">{formatDate(user.lastActive)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="usage-grid">
        <section className="panel panel-wide">
          <SectionHeading eyebrow="STREAM" title="技能使用流水" />
          <div className="activity-list">
            {usageEvents.slice(0, 10).map((event) => (
              <ActivityItem key={event.id} event={event} />
            ))}
            {usageEvents.length === 0 && <p className="muted small">暂无使用流水。</p>}
          </div>
        </section>

        <section className="panel">
          <SectionHeading eyebrow="HOW IT WORKS" title="数据从哪里来" />
          <ol className="how-list">
            <li>
              <strong>同步</strong>
              <span>git post-merge / post-checkout hook 自动同步团队技能，版本漂移在项目页可见。</span>
            </li>
            <li>
              <strong>使用采集</strong>
              <span>agent 读取 .teamai/skills 时由 Kimi Code PostToolUse hook 自动上报；teamai use 可一次完成读取与上报。</span>
            </li>
            <li>
              <strong>按人聚合</strong>
              <span>默认使用系统用户名，也可通过 --user 或 TEAMAI_USER 指定成员；流水标注 Agent 自动 / CLI / 手动补录。</span>
            </li>
          </ol>
        </section>
      </div>
    </div>
  );
}
