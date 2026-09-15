export const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const firstNumber = (
  source: unknown,
  keys: string[],
): number | null => {
  const record = asRecord(source);

  for (const key of keys) {
    const value = record[key];
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  if (typeof source === 'number' && Number.isFinite(source)) {
    return source;
  }

  return null;
};

export const firstString = (source: unknown, keys: string[]): string => {
  const record = asRecord(source);

  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }

  return '';
};

const errorMessage = (body: unknown, status: number): string => {
  const record = asRecord(body);
  const nested = asRecord(record['error']);

  return (
    firstString(nested, ['error_msg', 'message', 'Message']) ||
    firstString(record, ['error_msg', 'message', 'error', 'description']) ||
    `HTTP ${status}`
  );
};

export const fetchJson = async (
  url: string,
  init?: RequestInit,
): Promise<unknown> => {
  const response = await fetch(url, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let body: unknown = null;

  if (text.trim()) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      body = { message: text.slice(0, 400) };
    }
  }

  if (!response.ok) {
    throw new Error(errorMessage(body, response.status));
  }

  return body;
};

export const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
