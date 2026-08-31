import { http } from '~/shared/api/http';
import type { Connection } from '../model/types';

export const fetchConnections = () => http<Connection[]>('/connections');

export const createConnection = (payload: {
  connectorId: string;
  name: string;
  credentials: Record<string, string>;
}) =>
  http<Connection>('/connections', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

export const updateConnection = (
  id: string,
  payload: { name?: string; credentials?: Record<string, string> },
) =>
  http<Connection>(`/connections/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

export const testConnection = (id: string) =>
  http<Connection>(`/connections/${id}/test`, { method: 'POST' });

export const deleteConnection = (id: string) =>
  http<{ ok: boolean }>(`/connections/${id}`, { method: 'DELETE' });
