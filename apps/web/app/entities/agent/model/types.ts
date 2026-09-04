import type { Workflow } from '../../workflow/model/types';

export type ComposerMode = 'build' | 'ask';

export type AgentCapability = 'ask' | 'plan';

export type AgentPlanKind = 'questions' | 'workflow';

export interface AgentProviderInfo {
  id: string;
  name: string;
  available: boolean;
  capabilities: AgentCapability[];
}

export interface AgentCatalog {
  active: string;
  providers: AgentProviderInfo[];
}

export interface AgentMessage {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  status?: 'error';
}

export interface ChatPage {
  messages: AgentMessage[];
  hasMore: boolean;
}

export interface WorkflowChat {
  ask: ChatPage;
  build: ChatPage;
}

export interface AgentReply {
  message: string;
  providerId: string;
}

export interface AgentPlanReply {
  kind: AgentPlanKind;
  providerId: string;
  message: string;
  questions: string[];
  connectors: string[];
  name?: string;
  workflow?: Workflow;
}
