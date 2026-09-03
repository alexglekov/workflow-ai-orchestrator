const API_KEY_STORAGE = 'ai-worker-api-key';

export class ApiUnauthorizedError extends Error {
  constructor(message = 'Нужен пароль API') {
    super(message);
    this.name = 'ApiUnauthorizedError';
  }
}

export const getApiKey = () => {
  if (typeof sessionStorage === 'undefined') {
    return '';
  }

  return sessionStorage.getItem(API_KEY_STORAGE) ?? '';
};

export const setApiKey = (value: string) => {
  sessionStorage.setItem(API_KEY_STORAGE, value);
};

export const clearApiKey = () => {
  sessionStorage.removeItem(API_KEY_STORAGE);
};

const messageFromBody = (raw: string, fallback: string) => {
  if (!raw) {
    return fallback;
  }

  try {
    const body = JSON.parse(raw) as { message?: string | string[] };

    if (Array.isArray(body.message)) {
      return body.message.join(', ');
    }

    if (body.message) {
      return body.message;
    }
  } catch {
    return raw.slice(0, 280);
  }

  return fallback;
};

const headerRecord = (headers?: HeadersInit): Record<string, string> => {
  if (!headers) {
    return {};
  }

  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (Array.isArray(headers)) {
    return Object.fromEntries(headers);
  }

  return headers;
};

const apiRoot = () => {
  const base = String(import.meta.env.VITE_API_URL || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api$/i, '');

  return base ? `${base}/api` : '/api';
};

export const http = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const { headers, ...rest } = init ?? {};
  const key = getApiKey();
  let response: Response;

  try {
    response = await fetch(`${apiRoot()}${path}`, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { 'X-Api-Key': key } : {}),
        ...headerRecord(headers),
      },
    });
  } catch (err) {
    if (err instanceof TypeError) {
      throw new Error(
        'Не удалось связаться с API. Если запрос долгий — агент мог не успеть ответить, повторите или смените модель.',
      );
    }

    throw err;
  }

  const raw = await response.text();

  if (response.status === 401) {
    throw new ApiUnauthorizedError(messageFromBody(raw, 'Нужен пароль API'));
  }

  if (!response.ok) {
    const fromApi = messageFromBody(raw, '');

    if (fromApi) {
      throw new Error(fromApi);
    }

    if (response.status === 502 || response.status === 503) {
      throw new Error('API недоступен. Подождите секунду и обновите страницу.');
    }

    throw new Error(`HTTP ${response.status}`);
  }

  if (!raw) {
    return undefined as T;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error('Сервер вернул некорректный ответ');
  }
};
