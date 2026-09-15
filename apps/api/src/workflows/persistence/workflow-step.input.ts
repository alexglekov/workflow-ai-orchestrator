export type WorkflowStepInput = {
  title: string;
  connectorId: string;
  action: string;
  params?: Record<string, unknown>;
  connectionId?: string | null;
  iterate?: boolean;
};
