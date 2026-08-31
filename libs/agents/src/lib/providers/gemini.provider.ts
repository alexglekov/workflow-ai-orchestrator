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

const textFromParts = (parts: Array<{ text?: string }> | undefined): string =>
  (parts ?? []).map((part) => part.text || '').join('').trim();

const describeGeminiError = (status: number, message?: string) => {
  const text = (message || '').trim();

  if (/location is not supported/i.test(text)) {
    return [
      'Google Gemini недоступен из вашей страны.',
      'Задайте прокси в GEMINI_BASE_URL, включите VPN',
      'или выберите другого агента (OpenAI / Локальный).',
    ].join(' ');
  }

  if (/no longer available|not found/i.test(text)) {
    return `Модель Gemini недоступна. Укажите другую в GEMINI_MODEL. ${text}`;
  }

  if (status === 401 || status === 403 || /api key/i.test(text)) {
    return 'Неверный или отозванный GEMINI_API_KEY.';
  }

  return text || `Gemini HTTP ${status}`;
};

export class GeminiAgent implements AgentProvider {
  id = 'gemini';
  name = 'Gemini';
  capabilities: AgentProvider['capabilities'] = ['ask', 'plan'];

  available = () => Boolean(agentConfig.geminiKey());

  ask = async (input: AgentAskInput): Promise<AgentReply> => {
    const contents = [
      ...recentHistory(input.history).map((item) => ({
        role: item.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: item.content }],
      })),
      { role: 'user', parts: [{ text: input.message }] },
    ];

    const text = await this.complete(
      `${ASK_SYSTEM_PROMPT}\n\n${contextBlock(input.context)}`,
      contents,
      0.4,
    );

    return { message: text, providerId: this.id };
  };

  plan = async (input: AgentPlanInput): Promise<AgentPlanResult> => {
    const contents = [
      ...recentHistory(input.history).map((item) => ({
        role: item.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: item.content }],
      })),
      {
        role: 'user',
        parts: [
          {
            text: input.prompt === input.message
              ? input.message
              : `Исходная задача: ${input.prompt}\n\nОтвет пользователя: ${input.message}`,
          },
        ],
      },
    ];
    const text = await this.complete(
      `${PLAN_SYSTEM_PROMPT}\n\n${contextBlock(input.context)}`,
      contents,
      0.2,
      true,
    );

    return parsePlanResponse(text, this.id);
  };

  private complete = async (
    system: string,
    contents: Array<{ role: string; parts: Array<{ text: string }> }>,
    temperature: number,
    json = false,
  ) => {
    const key = agentConfig.geminiKey();

    if (!key) {
      throw new Error('Не задан GEMINI_API_KEY');
    }

    const model = agentConfig.geminiModel();
    const base = agentConfig.geminiBaseUrl().replace(/\/+$/, '');
    const response = await fetch(
      `${base}/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
          generationConfig: {
            temperature,
            ...(json ? { responseMimeType: 'application/json' } : {}),
          },
        }),
      },
    );
    const body = (await response.json()) as {
      error?: { message?: string };
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    if (!response.ok) {
      throw new Error(describeGeminiError(response.status, body.error?.message));
    }

    const text = textFromParts(body.candidates?.[0]?.content?.parts);

    if (!text) {
      throw new Error('Gemini вернул пустой ответ');
    }

    return text;
  };
}
