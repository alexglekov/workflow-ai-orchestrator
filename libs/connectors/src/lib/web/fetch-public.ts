import { USER_AGENT, assertPublicHttpUrl } from './ssrf';

const MAX_BYTES = 1_500_000;

export type PublicResponse = {
  url: string;
  status: number;
  contentType: string;
  body: string;
};

export type FetchPublicOptions = RequestInit & {
  timeoutMs?: number;
  retries?: number;
  acceptStatus?: (status: number) => boolean;
};

const charsetOf = (contentType: string, head: string): string => {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];

  if (fromHeader) {
    return fromHeader.toLowerCase();
  }

  const fromMeta =
    /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] ||
    /<meta[^>]+content=["'][^"']*charset=([\w-]+)/i.exec(head)?.[1];

  return (fromMeta || 'utf-8').toLowerCase();
};

const decodeBody = (buffer: Buffer, contentType: string): string => {
  const label = charsetOf(contentType, buffer.subarray(0, 4096).toString('latin1'));

  if (label === 'utf-8' || label === 'utf8' || label === 'ascii') {
    return buffer.toString('utf8');
  }

  try {
    return new TextDecoder(label).decode(buffer);
  } catch {
    return buffer.toString('utf8');
  }
};

const readLimited = async (
  response: Response,
  contentType: string,
): Promise<string> => {
  if (Number(response.headers.get('content-length') || 0) > MAX_BYTES) {
    throw new Error('Ответ слишком большой');
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length > MAX_BYTES) {
    throw new Error('Ответ слишком большой');
  }

  return decodeBody(buffer, contentType);
};

const BROWSER_HEADERS: Record<string, string> = {
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,application/json;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
  'Upgrade-Insecure-Requests': '1',
};

const RETRIABLE = new Set([408, 409, 425, 429, 500, 502, 503, 504, 522, 524]);

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const once = async (
  rawUrl: string,
  options: FetchPublicOptions,
): Promise<PublicResponse> => {
  let current = assertPublicHttpUrl(rawUrl).toString();
  let method = options.method;
  let body = options.body;

  for (let hop = 0; hop < 5; hop += 1) {
    const response = await fetch(current, {
      ...options,
      method,
      body,
      redirect: 'manual',
      headers: {
        ...BROWSER_HEADERS,
        'User-Agent': USER_AGENT,
        ...(options.headers as Record<string, string> | undefined),
      },
      signal: options.signal ?? AbortSignal.timeout(options.timeoutMs ?? 20_000),
    });

    const location = response.headers.get('location');

    if (response.status >= 300 && response.status < 400 && location) {
      current = assertPublicHttpUrl(
        new URL(location, current).toString(),
      ).toString();
      method = 'GET';
      body = undefined;
      continue;
    }

    const accepted = options.acceptStatus
      ? options.acceptStatus(response.status)
      : response.ok;

    if (!accepted) {
      const error = new Error(`HTTP ${response.status} для ${current}`);

      Object.assign(error, { status: response.status });
      throw error;
    }

    const contentType = response.headers.get('content-type') || '';

    return {
      url: current,
      status: response.status,
      contentType,
      body: await readLimited(response, contentType),
    };
  }

  throw new Error('Слишком много редиректов');
};

export const fetchPublic = async (
  rawUrl: string,
  options: FetchPublicOptions = {},
): Promise<PublicResponse> => {
  const attempts = Math.max(1, (options.retries ?? 2) + 1);
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await once(rawUrl, options);
    } catch (error) {
      lastError = error;

      const status = (error as { status?: number }).status;
      const retriable = status === undefined || RETRIABLE.has(status);

      if (!retriable || attempt === attempts - 1) {
        break;
      }

      await sleep(400 * 2 ** attempt);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Не удалось загрузить страницу');
};
