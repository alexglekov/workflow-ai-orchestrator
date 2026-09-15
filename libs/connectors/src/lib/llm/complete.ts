export type LlmProviderId = 'gemini' | 'qwen';

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
  timeoutMs?: number;
  signal?: AbortSignal;
};

const LLM_TIMEOUT_MS = 90_000;

const textFromParts = (parts: Array<{ text?: string }> | undefined): string =>
  (parts ?? []).map((part) => part.text || '').join('').trim();

const fetchLlm = async (url: string, init: RequestInit, timeoutMs = LLM_TIMEOUT_MS) => {
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = init.signal
    ? AbortSignal.any([timeout, init.signal])
    : timeout;

  try {
    return await fetch(url, {
      ...init,
      signal,
    });
  } catch (err) {
    if (init.signal?.aborted) {
      const reason = init.signal.reason;

      throw reason instanceof Error ? reason : new Error('Отменён');
    }

    if (
      err instanceof Error &&
      (err.name === 'TimeoutError' || err.name === 'AbortError')
    ) {
      throw new Error(
        'Модель не ответила вовремя. Повторите запрос или выберите другого агента.',
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
      'или выберите агента Qwen.',
    ].join(' ');
  }

  if (/no longer available|not found/i.test(text)) {
    return `Модель Gemini недоступна. Укажите другую в GEMINI_MODEL. ${text}`;
  }

  if (status === 429 || /quota|rate.limit|resource.?exhausted/i.test(text)) {
    return 'Превышена квота Gemini. Подождите минуту или проверьте биллинг в AI Studio.';
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
      signal: options.signal,
    },
    options.timeoutMs,
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

/** DashScope отвечает то в формате OpenAI, то своим {code, message}. */
export const describeQwenError = (
  status: number,
  message?: string,
  code?: string,
) => {
  const text = (message || '').trim();
  const reason = `${code || ''} ${text}`.trim();

  if (status === 401 || /InvalidApiKey|invalid.*api.?key/i.test(reason)) {
    return 'Неверный или отозванный QWEN_API_KEY. Ключ привязан к региону — проверьте QWEN_BASE_URL.';
  }

  if (/Arrearage|insufficient.*balance/i.test(reason)) {
    return 'На аккаунте Alibaba Model Studio нет средств — пополните баланс.';
  }

  if (status === 429 || /Throttling|rate.?limit|quota/i.test(reason)) {
    return 'Превышена квота Qwen. Подождите минуту или проверьте лимиты в Model Studio.';
  }

  if (/model.*not.*(exist|found)|InvalidParameter.*model/i.test(reason)) {
    return `Модель Qwen недоступна. Укажите другую в QWEN_MODEL. ${text}`;
  }

  return text || `Qwen HTTP ${status}`;
};

/** Qwen вызывается через OpenAI-совместимый режим DashScope. */
const completeQwen = async (options: LlmCompleteOptions): Promise<string> => {
  const base = (
    options.baseUrl || 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
  ).replace(/\/+$/, '');
  const response = await fetchLlm(
    `${base}/chat/completions`,
    {
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
      signal: options.signal,
    },
    options.timeoutMs,
  );
  const body = (await response.json()) as {
    error?: { message?: string; code?: string };
    code?: string;
    message?: string;
    choices?: Array<{ message?: { content?: string } }>;
  };

  if (!response.ok) {
    throw new Error(
      describeQwenError(
        response.status,
        body.error?.message || body.message,
        body.error?.code || body.code,
      ),
    );
  }

  const text = body.choices?.[0]?.message?.content?.trim();

  if (!text) {
    throw new Error('Qwen вернул пустой ответ');
  }

  return text;
};

export const completeLlm = async (
  options: LlmCompleteOptions,
): Promise<string> => {
  if (!options.apiKey) {
    throw new Error(
      options.provider === 'qwen'
        ? 'Не задан QWEN_API_KEY'
        : 'Не задан GEMINI_API_KEY',
    );
  }

  if (!options.model) {
    throw new Error('Не задана модель LLM');
  }

  if (options.provider === 'qwen') {
    return completeQwen(options);
  }

  return completeGemini(options);
};
