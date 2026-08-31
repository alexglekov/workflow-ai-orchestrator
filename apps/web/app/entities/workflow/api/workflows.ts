import { http } from '~/shared/api/http';
import type { Workflow } from '../model/types';

export const fetchWorkflows = () => http<Workflow[]>('/workflows');

export const createWorkflow = (payload?: { name?: string; prompt?: string }) =>
  http<Workflow>('/workflows', {
    method: 'POST',
    body: JSON.stringify(payload ?? {}),
  });

export const fetchWorkflow = (id: string) => http<Workflow>(`/workflows/${id}`);

export const updateWorkflow = (
  id: string,
  payload: {
    name?: string;
    prompt?: string;
    steps?: Array<{
      title: string;
      connectorId: string;
      action: string;
      params?: Record<string, unknown>;
      connectionId?: string;
      iterate?: boolean;
    }>;
  },
) =>
  http<Workflow>(`/workflows/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

export const parseWorkflow = (id: string, prompt: string) =>
  http<Workflow>(`/workflows/${id}/parse`, {
    method: 'POST',
    body: JSON.stringify({ prompt }),
  });

export const createDemoWorkflow = () =>
  http<Workflow>('/workflows/demo', { method: 'POST' });

export const deleteWorkflow = (id: string) =>
  http<void>(`/workflows/${id}`, { method: 'DELETE' });

export const clearWorkflows = () => http<void>('/workflows', { method: 'DELETE' });
