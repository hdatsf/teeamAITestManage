export interface SkillStats {
  invocations7d: number;
  projects: number;
  projectsCurrent: number;
}

export interface Skill {
  slug: string;
  name: string;
  description: string;
  tags: string[];
  version: string;
  publishedAt: string;
  publishedBy: string;
  updatedAt: string;
  body: string;
  content: string;
  sha256: string;
  stats: SkillStats;
}

export interface ProjectBehind {
  slug: string;
  name: string;
  installedVersion: string;
  latestVersion: string;
}

export interface Project {
  id: string;
  name: string;
  repoUrl: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  lastSyncAt: string | null;
  lastSyncBy: string | null;
  syncs7d: number;
  invocations7d: number;
  installedCount: number;
  behind: ProjectBehind[];
  users: string[];
  status: 'current' | 'behind' | 'never';
}

export interface Activity {
  id: number;
  type: string;
  projectId: string | null;
  projectName: string | null;
  actor: string;
  skillSlug: string | null;
  skillName: string | null;
  version: string | null;
  action: string | null;
  detail: string | null;
  durationMs: number | null;
  createdAt: string;
  source: string | null;
}

export interface Overview {
  totals: {
    projects: number;
    skills: number;
    syncs7d: number;
    invocations7d: number;
    activeUsers7d: number;
    behindProjects: number;
  };
  series: Array<{ date: string; syncs: number; invocations: number }>;
  recent: Activity[];
  projects: Project[];
  skills: Skill[];
}

export interface UserUsage {
  actor: string;
  invocations: number;
  syncs: number;
  lastActive: string;
  projects: string[];
  topSkill: string | null;
}

export interface Usage {
  days: number;
  users: UserUsage[];
  skills: Array<{ slug: string; name: string; count: number }>;
  projects: Array<{ projectId: string; name: string; count: number }>;
  daily: Array<{ date: string; count: number }>;
}

export interface InstalledSkill {
  slug: string;
  version: string;
  syncedAt: string;
  name: string;
  latestVersion: string;
  current: boolean;
}

export interface ProjectDetail {
  project: Project;
  installed: InstalledSkill[];
  events: Activity[];
}

export interface PublishPayload {
  slug: string;
  name: string;
  description: string;
  tags: string[];
  body: string;
  version?: string;
  publishedBy?: string;
}
