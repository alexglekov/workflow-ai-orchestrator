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
    .map(({ role, content }) => ({
      role,
      content: content
        .replace(/\[\[connect:[a-z0-9_]+\]\]/gi, '')
        .split('[[connect_telegram]]')
        .join('')
        .split('[[launch]]')
        .join('')
        .replace(/\[\[status:connected:[a-z0-9_]+\]\]/gi, '')
        .split('[[status:launched]]')
        .join('')
        .split('[[status:stopped]]')
        .join('')
        .replace(/\[\[run:[a-z0-9-]+\]\]/gi, '')
        .trim(),
    }));

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

export const chatAgent = (payload: {
  message: string;
  prompt?: string;
  providerId?: string;
  workflowId?: string;
  history?: AgentMessage[];
}) =>
  http<AgentPlanReply>('/agents/chat', {
    method: 'POST',
    body: JSON.stringify({
      ...payload,
      history: toAgentHistory(payload.history),
    }),
  });

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
