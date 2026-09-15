export type TriggerType = 'schedule' | 'webhook' | 'mail' | 'telegram';

export interface WorkflowTrigger {
  id: string;
  workflowId: string;
  type: TriggerType | string;
  enabled: boolean;
  config: Record<string, unknown>;
  token: string | null;
  webhookUrl?: string | null;
  lastFiredAt: string | null;
  createdAt: string;
  updatedAt: string;
}
