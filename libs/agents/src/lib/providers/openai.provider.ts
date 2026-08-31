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
          role: 'system',
          content: `${ASK_SYSTEM_PROMPT}\n\n${contextBlock(input.context)}`,
        },
        ...recentHistory(input.history).map((item) => ({
          role: item.role,
          content: item.content,
        })),
        { role: 'user', content: input.message },
      ],
      0.4,
    );

    return { message: text, providerId: this.id };
  };

  plan = async (input: AgentPlanInput): Promise<AgentPlanResult> => {
    const text = await this.complete(
      [
        {
          role: 'system',
          content: `${PLAN_SYSTEM_PROMPT}\n\n${contextBlock(input.context)}`,
        },
        ...recentHistory(input.history).map((item) => ({
          role: item.role,
          content: item.content,
        })),
        {
          role: 'user',
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

  private complete = async (
    messages: Array<{ role: string; content: string }>,
    temperature: number,
    json = false,
  ) => {
    const key = agentConfig.openaiKey();

    if (!key) {
      throw new Error('Не задан OPENAI_API_KEY');
    }

    const base = agentConfig.openaiBaseUrl().replace(/\/+$/, '');
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: agentConfig.openaiModel(),
        temperature,
        messages,
        ...(json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
    const body = (await response.json()) as {
      error?: { message?: string };
      choices?: Array<{ message?: { content?: string } }>;
    };

    if (!response.ok) {
      throw new Error(body.error?.message || `OpenAI HTTP ${response.status}`);
    }

    const text = body.choices?.[0]?.message?.content?.trim();

    if (!text) {
      throw new Error('OpenAI вернул пустой ответ');
    }

    return text;
  };
}
