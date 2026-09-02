import type { LlmProviderId } from './complete';

export type ResolvedLlm = {
  provider: LlmProviderId;
  apiKey: string;
  model: string;
  baseUrl: string;
};

const env = (key: string): string => process.env[key] || '';

const asProvider = (value: string): LlmProviderId | '' => {
  const normalized = value.trim().toLowerCase();

  if (normalized === 'openai' || normalized === 'gemini') {
    return normalized;
  }

  return '';
};

export const resolveLlm = (
  credentials: Record<string, string> = {},
): ResolvedLlm => {
  const geminiKey = env('GEMINI_API_KEY');
  const openaiKey = env('OPENAI_API_KEY');
  const requested = asProvider(
    credentials['provider'] || env('AGENT_PROVIDER'),
  );
  let provider: LlmProviderId =
    requested || (geminiKey ? 'gemini' : openaiKey ? 'openai' : 'gemini');
  let apiKey =
    credentials['apiKey'] || (provider === 'openai' ? openaiKey : geminiKey);

  if (!apiKey && provider === 'gemini' && openaiKey) {
    provider = 'openai';
    apiKey = openaiKey;
  } else if (!apiKey && provider === 'openai' && geminiKey) {
    provider = 'gemini';
    apiKey = geminiKey;
  }

  if (provider === 'openai') {
    return {
      provider,
      apiKey,
      model: credentials['model'] || env('OPENAI_MODEL') || 'gpt-4o-mini',
      baseUrl:
        credentials['baseUrl'] ||
        env('OPENAI_BASE_URL') ||
        'https://api.openai.com/v1',
    };
  }

  return {
    provider,
    apiKey,
    model: credentials['model'] || env('GEMINI_MODEL') || 'gemini-3.6-flash',
    baseUrl:
      credentials['baseUrl'] ||
      env('GEMINI_BASE_URL') ||
      'https://generativelanguage.googleapis.com/v1beta',
  };
};
