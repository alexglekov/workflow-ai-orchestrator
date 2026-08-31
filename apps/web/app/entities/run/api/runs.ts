import { http } from '~/shared/api/http';
import type { Run } from '../model/types';

export const startRun = (
  workflowId: string,
  input?: Record<string, unknown>,
) =>
  http<Run>(`/workflows/${workflowId}/runs`, {
    method: 'POST',
    body: JSON.stringify({ input: input ?? {} }),
  });

export const retryRun = (id: string) =>
  http<Run>(`/runs/${id}/retry`, { method: 'POST' });

export const fetchRun = (id: string) => http<Run>(`/runs/${id}`);
