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

export const http = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  });
  const raw = await response.text();

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
