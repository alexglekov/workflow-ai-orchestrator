export interface RunStep {
  id: string;
  order: number;
  title: string;
  connectorId: string;
  action: string;
  status: 'pending' | 'running' | 'success' | 'error' | string;
  input: unknown;
  output: unknown;
  error: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface Run {
  id: string;
  workflowId: string;
  status: 'pending' | 'running' | 'success' | 'error' | string;
  startedAt: string | null;
  finishedAt: string | null;
  steps: RunStep[];
  createdAt: string;
}
