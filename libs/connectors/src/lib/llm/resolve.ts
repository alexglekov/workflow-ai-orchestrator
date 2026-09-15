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

const env = (key: string): string => process.env[key] || '';

export const resolveLlm = (
  credentials: Record<string, string> = {},
): ResolvedLlm => ({
  provider: 'qwen',
  apiKey: credentials['apiKey'] || env('QWEN_API_KEY'),
  model: credentials['model'] || env('QWEN_MODEL') || QWEN_DEFAULT_MODEL,
  baseUrl:
    credentials['baseUrl'] || env('QWEN_BASE_URL') || QWEN_DEFAULT_BASE_URL,
});
