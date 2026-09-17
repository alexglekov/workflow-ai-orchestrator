import { completeLlm, type LlmProviderId } from '@ai-worker/connectors';
import { agentConfig } from './config';
import {
  ORCHESTRATOR_SYSTEM_PROMPT,
  contextBlock,
  recentHistory,
} from './prompts';
import { CHAT_WORKERS } from './providers/orchestrator.provider';
import type { AgentContext, AgentMessage } from './types';

export type ChatIntent = 'ask' | 'plan';
export type ChatWorkerId = (typeof CHAT_WORKERS)[number];

export type ChatRoute = {
  intent: ChatIntent;
  providerId: ChatWorkerId;
};

const AUTO_IDS = new Set(['', 'auto', 'orchestrator']);

const asIntent = (value: unknown): ChatIntent | undefined =>
  value === 'ask' || value === 'plan' ? value : undefined;

const asWorker = (value: unknown): ChatWorkerId | undefined =>
  value === 'qwen' || value === 'openai' ? value : undefined;

export const parseChatRoute = (
  text: string,
  fallback: ChatRoute,
): ChatRoute => {
  try {
    const parsed = JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/u, '').trim()) as {
      intent?: unknown;
      provider?: unknown;
      providerId?: unknown;
    };

    return {
      intent: asIntent(parsed.intent) ?? fallback.intent,
      providerId:
        asWorker(parsed.provider) ??
        asWorker(parsed.providerId) ??
        fallback.providerId,
    };
  } catch {
    return fallback;
  }
};

export const inferChatIntent = (
  message: string,
  hasWorkflow: boolean,
): ChatIntent => {
  const text = message.trim();

  if (!text) {
    return hasWorkflow ? 'ask' : 'plan';
  }

  if (
    /^(сделай|создай|собери|пришли|отправь|скинь|добавь|убери|удали|замени|поменяй|измени|подключи|поставь|настрой)(\s|$)/i.test(
      text,
    )
  ) {
    return 'plan';
  }

  if (
    /(отправь|пришли|скинь).{0,80}(тг|телеграм|telegram)/i.test(text) ||
    /((каждый час|каждые \d+|ежечасно|по расписанию).{0,80}(отправ|пришли|собери|курс)|(отправ|пришли|собери|курс).{0,80}(каждый час|каждые \d+|ежечасно))/i.test(
      text,
    )
  ) {
    return 'plan';
  }

  if (
    /бот|workflow|сценари|цепочк|шаг|расписан|каждые |каждую /i.test(text) &&
    /(сделай|нужно|хочу|добавь|убери|поменяй|чтобы)/i.test(text)
  ) {
    return 'plan';
  }

  if (
    /^(как |почему |зачем |что такое|что это|можно ли|умеешь|расскажи|объясни|чем отличается)/i.test(
      text,
    ) ||
    (text.endsWith('?') && text.length < 280 && !/сделай|добавь|убери|создай/i.test(text))
  ) {
    return 'ask';
  }

  return hasWorkflow ? 'ask' : 'plan';
};

export const inferChatProvider = (
  message: string,
  available: ChatWorkerId[],
): ChatWorkerId => {
  if (!available.length) {
    return 'qwen';
  }

  if (available.length === 1) {
    return available[0];
  }

  const prefersOpenAI =
    available.includes('openai') &&
    (/[A-Za-z]{4,}/.test(message) ||
      /сложн|неоднознач|одновременно|если .* иначе|reason(ing)?/i.test(message) ||
      message.length > 420);

  if (prefersOpenAI) {
    return 'openai';
  }

  return available.includes('qwen') ? 'qwen' : available[0];
};

const availableWorkers = (ids: string[]): ChatWorkerId[] =>
  CHAT_WORKERS.filter((id) => ids.includes(id));

const pinWorker = (
  requested: string | undefined,
  available: ChatWorkerId[],
): ChatWorkerId | undefined => {
  const id = (requested || '').trim();

  if (!id || AUTO_IDS.has(id)) {
    return undefined;
  }

  const worker = asWorker(id);

  if (worker && available.includes(worker)) {
    return worker;
  }

  return undefined;
};

const routerCredentials = () => {
  if (agentConfig.qwenKey()) {
    return {
      provider: 'qwen' as LlmProviderId,
      apiKey: agentConfig.qwenKey(),
      model: agentConfig.qwenModel(),
      baseUrl: agentConfig.qwenBaseUrl(),
    };
  }

  if (agentConfig.openaiKey()) {
    return {
      provider: 'openai' as LlmProviderId,
      apiKey: agentConfig.openaiKey(),
      model: agentConfig.openaiModel(),
      baseUrl: agentConfig.openaiBaseUrl(),
    };
  }

  return null;
};

const clampRoute = (
  route: ChatRoute,
  available: ChatWorkerId[],
  pinned?: ChatWorkerId,
): ChatRoute => ({
  intent: route.intent,
  providerId: pinned
    ? pinned
    : available.includes(route.providerId)
      ? route.providerId
      : available[0],
});

export const routeChat = async ({
  message,
  prompt,
  history,
  context,
  requestedProvider,
  availableProviderIds,
}: {
  message: string;
  prompt?: string;
  history?: AgentMessage[];
  context: AgentContext;
  requestedProvider?: string;
  availableProviderIds: string[];
}): Promise<ChatRoute> => {
  const available = availableWorkers(availableProviderIds);
  const pinned = pinWorker(requestedProvider, available);
  const fallback: ChatRoute = {
    intent: inferChatIntent(
      message,
      Boolean(context.workflow?.steps.length),
    ),
    providerId: pinned ?? inferChatProvider(message, available),
  };

  if (!available.length) {
    return fallback;
  }

  const creds = routerCredentials();

  if (!creds) {
    return clampRoute(fallback, available, pinned);
  }

  try {
    const text = await completeLlm({
      ...creds,
      temperature: 0,
      json: true,
      timeoutMs: 20_000,
      messages: [
        { role: 'system', content: ORCHESTRATOR_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            contextBlock(context),
            prompt && prompt !== message ? `Исходная задача: ${prompt}` : '',
            recentHistory(history, 6)
              .map((item) => `${item.role}: ${item.content}`)
              .join('\n'),
            `Сообщение: ${message}`,
            pinned ? `Модель уже выбрана пользователем: ${pinned}. Поле provider всё равно заполни, но его можно игнорировать.` : '',
          ]
            .filter(Boolean)
            .join('\n\n'),
        },
      ],
    });

    return clampRoute(parseChatRoute(text, fallback), available, pinned);
  } catch {
    return clampRoute(fallback, available, pinned);
  }
};
