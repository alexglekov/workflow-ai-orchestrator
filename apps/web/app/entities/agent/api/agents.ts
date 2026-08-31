import { http } from '~/shared/api/http';
import type {
  AgentCatalog,
  AgentMessage,
  AgentPlanReply,
  AgentReply,
} from '../model/types';

export const toAgentHistory = (messages: AgentMessage[] = []) =>
  messages
    .filter((item) => item.status !== 'error')
    .map(({ role, content }) => ({ role, content }));

export const fetchAgents = () => http<AgentCatalog>('/agents');

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
