export type LlmProviderId = 'qwen';

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
        'Модель не ответила вовремя. Повторите запрос.',
      );
    }

    throw err;
  }
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
    throw new Error('Не задан QWEN_API_KEY');
  }

  if (!options.model) {
    throw new Error('Не задана модель LLM');
  }

  return completeQwen(options);
};
