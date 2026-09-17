import { completeLlm, type LlmProviderId } from '@ai-worker/connectors';
import { agentConfig } from '../config';
import {
  ASK_SYSTEM_PROMPT,
  contextBlock,
  PLAN_SYSTEM_PROMPT,
  recentHistory,
} from '../prompts';
import { parsePlanResponse } from '../plan-result';
import type {
  AgentAskInput,
  AgentPlanInput,
  AgentPlanResult,
  AgentProvider,
  AgentReply,
} from '../types';

const credentials = (id: LlmProviderId) =>
  id === 'openai'
    ? {
        apiKey: agentConfig.openaiKey(),
        model: agentConfig.openaiModel(),
        baseUrl: agentConfig.openaiBaseUrl(),
      }
    : {
        apiKey: agentConfig.qwenKey(),
        model: agentConfig.qwenModel(),
        baseUrl: agentConfig.qwenBaseUrl(),
      };

export class LlmChatAgent implements AgentProvider {
  capabilities: AgentProvider['capabilities'] = ['ask', 'plan'];

  constructor(
    readonly id: LlmProviderId,
    readonly name: string,
  ) {}

  available = () => Boolean(credentials(this.id).apiKey);

  ask = async (input: AgentAskInput): Promise<AgentReply> => {
    const text = await this.complete(
      [
        {
          role: 'system' as const,
          content: `${ASK_SYSTEM_PROMPT}\n\n${contextBlock(input.context)}`,
        },
        ...recentHistory(input.history).map((item) => ({
          role: item.role,
          content: item.content,
        })),
        { role: 'user' as const, content: input.message },
      ],
      0.4,
    );

    return { message: text, providerId: this.id };
  };

  plan = async (input: AgentPlanInput): Promise<AgentPlanResult> => {
    const text = await this.complete(
      [
        {
          role: 'system' as const,
          content: `${PLAN_SYSTEM_PROMPT}\n\n${contextBlock(input.context)}`,
        },
        ...recentHistory(input.history).map((item) => ({
          role: item.role,
          content: item.content,
        })),
        {
          role: 'user' as const,
          content:
            input.prompt === input.message
              ? input.message
              : `Исходная задача: ${input.prompt}\n\nОтвет пользователя: ${input.message}`,
        },
      ],
      0.2,
      true,
    );

    return parsePlanResponse(text, this.id);
  };

  private complete = (
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    temperature: number,
    json = false,
  ) => {
    const creds = credentials(this.id);

    return completeLlm({
      provider: this.id,
      apiKey: creds.apiKey,
      model: creds.model,
      baseUrl: creds.baseUrl,
      messages,
      temperature,
      json,
    });
  };
}
