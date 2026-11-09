import type {
  Overview,
  ProjectDetail,
  PublishPayload,
  Skill,
  Usage,
} from './types';

const ADMIN_TOKEN = import.meta.env.VITE_TEAMAI_ADMIN_TOKEN ?? 'teamai-admin-local';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message =
      (data as { error?: { message?: string } } | null)?.error?.message ??
      response.statusText ??
      '请求失败';
    throw new ApiError(message, response.status);
  }
  return data as T;
}

export const api = {
  overview(days = 14) {
    return request<Overview>(`/api/v1/overview?days=${days}`);
  },
  usage(days = 30) {
    return request<Usage>(`/api/v1/usage?days=${days}`);
  },
  skills() {
    return request<{ items: Skill[] }>('/api/v1/skills');
  },
  project(id: string) {
    return request<ProjectDetail>(`/api/v1/projects/${encodeURIComponent(id)}`);
  },
  publish(payload: PublishPayload) {
    return request<{ skill: Skill; publishedVersion: string }>('/api/v1/skills', {
      method: 'POST',
      headers: { 'x-teamai-admin': ADMIN_TOKEN },
      body: JSON.stringify(payload),
    });
  },
};
