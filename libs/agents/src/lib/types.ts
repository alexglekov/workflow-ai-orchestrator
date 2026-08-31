export type AgentCapability = 'ask' | 'plan';

export type AgentRole = 'user' | 'assistant';

export type AgentPlanKind = 'questions' | 'workflow';

export interface AgentMessage {
  role: AgentRole;
  content: string;
}

export interface AgentCatalogItem {
  id: string;
  name: string;
  description?: string;
  actions: Array<{
    id: string;
    name: string;
    description?: string;
    params?: Record<
      string,
      { type?: string; required?: boolean; description?: string }
    >;
  }>;
}

export interface AgentWorkflowContext {
  id: string;
  name: string;
  prompt: string;
  steps: Array<{
    title: string;
    connectorId: string;
    action: string;
  }>;
}

export interface AgentContext {
  workflow?: AgentWorkflowContext;
  connectors: AgentCatalogItem[];
  connections: Array<{ name: string; connectorId: string }>;
}

export interface AgentAskInput {
  message: string;
  history?: AgentMessage[];
  context: AgentContext;
  providerId?: string;
}

export interface AgentReply {
  message: string;
  providerId: string;
}

export interface AgentPlanInput {
  prompt: string;
  message: string;
  history?: AgentMessage[];
  context: AgentContext;
  providerId?: string;
}

export interface AgentPlannedStep {
  title: string;
  connectorId: string;
  action: string;
  params: Record<string, unknown>;
  iterate?: boolean;
}

export interface AgentPlanResult {
  kind: AgentPlanKind;
  providerId: string;
  message: string;
  questions: string[];
  connectors: string[];
  name?: string;
  steps: AgentPlannedStep[];
}

export interface AgentInfo {
  id: string;
  name: string;
  available: boolean;
  capabilities: AgentCapability[];
}

export interface AgentProvider {
  id: string;
  name: string;
  capabilities: AgentCapability[];
  available: () => boolean;
  ask: (input: AgentAskInput) => Promise<AgentReply>;
  plan?: (input: AgentPlanInput) => Promise<AgentPlanResult>;
}
