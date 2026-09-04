import type { LlmProviderId } from './complete';

export type ResolvedLlm = {
  provider: LlmProviderId;
  apiKey: string;
  model: string;
  baseUrl: string;
};

export const QWEN_DEFAULT_MODEL = 'qwen-plus';
/** Регион Singapore. Ключ DashScope привязан к региону — базу меняют вместе с ключом. */
export const QWEN_DEFAULT_BASE_URL =
  'https://dashscope-intl.aliyuncs.com/compatible-mode/v1';
export const GEMINI_DEFAULT_MODEL = 'gemini-3.6-flash';
export const GEMINI_DEFAULT_BASE_URL =
  'https://generativelanguage.googleapis.com/v1beta';

const env = (key: string): string => process.env[key] || '';

const asProvider = (value: string): LlmProviderId | '' => {
  const normalized = value.trim().toLowerCase();

  if (normalized === 'qwen' || normalized === 'gemini') {
    return normalized;
  }

  return '';
};

export const resolveLlm = (
  credentials: Record<string, string> = {},
): ResolvedLlm => {
  const geminiKey = env('GEMINI_API_KEY');
  const qwenKey = env('QWEN_API_KEY');
  const requested = asProvider(
    credentials['provider'] || env('AGENT_PROVIDER'),
  );
  let provider: LlmProviderId =
    requested || (geminiKey ? 'gemini' : qwenKey ? 'qwen' : 'gemini');
  let apiKey =
    credentials['apiKey'] || (provider === 'qwen' ? qwenKey : geminiKey);

  // Ключ есть только у второго провайдера — идём к нему, а не падаем.
  if (!apiKey && provider === 'gemini' && qwenKey) {
    provider = 'qwen';
    apiKey = qwenKey;
  } else if (!apiKey && provider === 'qwen' && geminiKey) {
    provider = 'gemini';
    apiKey = geminiKey;
  }

  if (provider === 'qwen') {
    return {
      provider,
      apiKey,
      model: credentials['model'] || env('QWEN_MODEL') || QWEN_DEFAULT_MODEL,
      baseUrl:
        credentials['baseUrl'] ||
        env('QWEN_BASE_URL') ||
        QWEN_DEFAULT_BASE_URL,
    };
  }

  return {
    provider,
    apiKey,
    model: credentials['model'] || env('GEMINI_MODEL') || GEMINI_DEFAULT_MODEL,
    baseUrl:
      credentials['baseUrl'] || env('GEMINI_BASE_URL') || GEMINI_DEFAULT_BASE_URL,
  };
};
