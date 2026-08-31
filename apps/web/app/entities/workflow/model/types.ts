export interface WorkflowStep {
  id: string;
  order: number;
  title: string;
  connectorId: string;
  action: string;
  params: Record<string, unknown>;
  connectionId: string | null;
}

export interface Workflow {
  id: string;
  name: string;
  prompt: string;
  steps: WorkflowStep[];
  createdAt: string;
  updatedAt: string;
}
