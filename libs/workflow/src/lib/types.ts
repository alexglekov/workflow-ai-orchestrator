export interface ParsedStep {
  title: string;
  connectorId: string;
  action: string;
  params: Record<string, unknown>;
}

export interface EngineStep {
  id: string;
  order: number;
  title: string;
  connectorId: string;
  action: string;
  params: Record<string, unknown>;
  connectionId?: string | null;
}

export type StepStatus = 'pending' | 'running' | 'success' | 'error';

export interface StepUpdate {
  stepId: string;
  status: StepStatus;
  input?: unknown;
  output?: unknown;
  error?: string | null;
  startedAt?: Date;
  finishedAt?: Date;
}

export interface RunWorkflowOptions {
  steps: EngineStep[];
  getConnector: (id: string) =>
    | {
        execute: (input: {
          action: string;
          params: Record<string, unknown>;
          previousResult: unknown;
          credentials: Record<string, string>;
        }) => Promise<{ ok: boolean; data?: unknown; error?: string }>;
      }
    | undefined;
  getCredentials: (
    connectionId: string | null | undefined,
    connectorId: string,
  ) => Promise<Record<string, string>>;
  onStepUpdate: (update: StepUpdate) => Promise<void>;
  initialInput?: unknown;
}
