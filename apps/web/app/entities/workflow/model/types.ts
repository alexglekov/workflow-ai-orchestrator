import type { WorkflowTrigger } from '../../trigger/model/types';

export interface WorkflowStep {
  id: string;
  order: number;
  title: string;
  connectorId: string;
  action: string;
  params: Record<string, unknown>;
  connectionId: string | null;
  iterate: boolean;
}

export interface Workflow {
  id: string;
  name: string;
  prompt: string;
  steps: WorkflowStep[];
  triggers?: WorkflowTrigger[];
  createdAt: string;
  updatedAt: string;
}
