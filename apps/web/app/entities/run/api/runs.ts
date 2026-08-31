import { http } from '~/shared/api/http';
import type { Run } from '../model/types';

export const startRun = (workflowId: string) =>
  http<Run>(`/workflows/${workflowId}/runs`, { method: 'POST' });

export const fetchRun = (id: string) => http<Run>(`/runs/${id}`);
