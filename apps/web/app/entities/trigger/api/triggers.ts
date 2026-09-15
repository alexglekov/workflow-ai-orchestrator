import { http } from '~/shared/api/http';
import type { TriggerType, WorkflowTrigger } from '../model/types';

export const fetchTriggers = (workflowId: string) =>
  http<WorkflowTrigger[]>(`/workflows/${workflowId}/triggers`);

export const createTrigger = (
  workflowId: string,
  payload: {
    type: TriggerType;
    everyMinutes?: number;
    at?: string;
    timezone?: string;
  },
) =>
  http<WorkflowTrigger>(`/workflows/${workflowId}/triggers`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const updateTrigger = (
  id: string,
  payload: {
    enabled?: boolean;
    everyMinutes?: number;
    at?: string | null;
    timezone?: string;
  },
) =>
  http<WorkflowTrigger>(`/triggers/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

export const deleteTrigger = (id: string) =>
  http<void>(`/triggers/${id}`, { method: 'DELETE' });
