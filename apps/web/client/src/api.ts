import type { Comparison, Report } from './types';

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(path, {
    ...init,
    headers: { 'content-type': 'application/json', ...init?.headers }
  });
  const body = (await response.json()) as { message?: string };
  if (!response.ok) throw new Error(body.message ?? `Request failed (${response.status})`);
  return body as T;
};

export const api = {
  create: (body: unknown) =>
    request<{ rehearsalId: string; status: string }>('/api/rehearsals', {
      method: 'POST',
      body: JSON.stringify(body)
    }),
  status: (id: string) =>
    request<{ status: string; progress: number; jobState: string; errorCode: string | null }>(
      `/api/rehearsals/${id}/status`
    ),
  report: (id: string) => request<Report>(`/api/rehearsals/${id}/report`),
  rerun: (id: string) =>
    request<{ rehearsalId: string }>(`/api/rehearsals/${id}/rerun`, { method: 'POST' }),
  share: (id: string) =>
    request<{ token: string; path: string }>(`/api/rehearsals/${id}/share`, { method: 'POST' }),
  publicReport: (token: string) =>
    request<Report>(`/api/public/reports/${encodeURIComponent(token)}`),
  compare: (baseline: string, candidate: string) =>
    request<Comparison>(
      `/api/comparisons?baseline=${encodeURIComponent(baseline)}&candidate=${encodeURIComponent(candidate)}`
    )
};
