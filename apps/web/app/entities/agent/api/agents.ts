import { http } from '~/shared/api/http';
import type {
  AgentCatalog,
  AgentMessage,
  AgentPlanReply,
  AgentReply,
  ChatPage,
  WorkflowChat,
} from '../model/types';

export const toAgentHistory = (messages: AgentMessage[] = []) =>
  messages
    .filter((item) => item.status !== 'error')
    .map(({ role, content }) => ({ role, content }));

export const fetchAgents = () => http<AgentCatalog>('/agents');

export const fetchWorkflowChat = (workflowId: string) =>
  http<WorkflowChat>(`/workflows/${workflowId}/chat`);

export const fetchWorkflowChatPage = (
  workflowId: string,
  thread: 'ask' | 'build',
  before: string,
) => {
  const query = new URLSearchParams({ thread, before });

  return http<ChatPage>(`/workflows/${workflowId}/chat?${query.toString()}`);
};

export const askAgent = (payload: {
  message: string;
  providerId?: string;
  workflowId?: string;
  history?: AgentMessage[];
}) =>
  http<AgentReply>('/agents/ask', {
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      history: toAgentHistory(payload.history),
    }),
  });

export const planAgent = (payload: {
  prompt: string;
  message?: string;
  providerId?: string;
  workflowId?: string;
  history?: AgentMessage[];
}) =>
  http<AgentPlanReply>('/agents/plan', {
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      history: toAgentHistory(payload.history),
    }),
  });
