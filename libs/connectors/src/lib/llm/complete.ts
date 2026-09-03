export type LlmProviderId = 'gemini' | 'openai';

export type LlmMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type LlmCompleteOptions = {
  provider: LlmProviderId;
  apiKey: string;
  model: string;
  baseUrl?: string;
  messages: LlmMessage[];
  temperature?: number;
  json?: boolean;
};

const LLM_TIMEOUT_MS = 120_000;

const textFromParts = (parts: Array<{ text?: string }> | undefined): string =>
  (parts ?? []).map((part) => part.text || '').join('').trim();

const fetchLlm = async (url: string, init: RequestInit) => {
  try {
    return await fetch(url, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(LLM_TIMEOUT_MS),
    });
  } catch (err) {
    if (
      err instanceof Error &&
      (err.name === 'TimeoutError' || err.name === 'AbortError')
    ) {
      throw new Error(
        'Модель не ответила за 2 минуты. Повторите запрос или выберите другого агента.',
      );
    }

    throw err;
  }
};

export const describeGeminiError = (status: number, message?: string) => {
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

const completeGemini = async (options: LlmCompleteOptions): Promise<string> => {
  const base = (
    options.baseUrl || 'https://generativelanguage.googleapis.com/v1beta'
  ).replace(/\/+$/, '');
  const system = options.messages
    .filter((item) => item.role === 'system')
    .map((item) => item.content)
    .join('\n\n')
    .trim();
  const contents = options.messages
    .filter((item) => item.role !== 'system')
    .map((item) => ({
      role: item.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: item.content }],
    }));

  if (contents.length === 0) {
    throw new Error('Пустой запрос к модели');
  }

  const response = await fetchLlm(
    `${base}/models/${options.model}:generateContent?key=${encodeURIComponent(options.apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents,
        generationConfig: {
          temperature: options.temperature ?? 0.2,
          ...(options.json ? { responseMimeType: 'application/json' } : {}),
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

const completeOpenAi = async (options: LlmCompleteOptions): Promise<string> => {
  const base = (options.baseUrl || 'https://api.openai.com/v1').replace(
    /\/+$/,
    '',
  );
  const response = await fetchLlm(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model,
      temperature: options.temperature ?? 0.2,
      messages: options.messages,
      ...(options.json ? { response_format: { type: 'json_object' } } : {}),
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

export const completeLlm = async (
  options: LlmCompleteOptions,
): Promise<string> => {
  if (!options.apiKey) {
    throw new Error(
      options.provider === 'openai'
        ? 'Не задан OPENAI_API_KEY'
        : 'Не задан GEMINI_API_KEY',
    );
  }

  if (!options.model) {
    throw new Error('Не задана модель LLM');
  }

  if (options.provider === 'openai') {
    return completeOpenAi(options);
  }

  return completeGemini(options);
};
