import { completeLlm } from '@ai-worker/connectors';
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

export class OpenAiAgent implements AgentProvider {
  id = 'openai';
  name = 'OpenAI';
  capabilities: AgentProvider['capabilities'] = ['ask', 'plan'];

  available = () => Boolean(agentConfig.openaiKey());

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
  ) =>
    completeLlm({
      provider: 'openai',
      apiKey: agentConfig.openaiKey(),
      model: agentConfig.openaiModel(),
      baseUrl: agentConfig.openaiBaseUrl(),
      messages,
      temperature,
      json,
    });
}
