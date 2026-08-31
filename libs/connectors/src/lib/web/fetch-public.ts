import { USER_AGENT, assertPublicHttpUrl } from './ssrf';

const MAX_BYTES = 1_500_000;

const readLimited = async (response: Response): Promise<string> => {
  const length = Number(response.headers.get('content-length') || 0);

  if (length > MAX_BYTES) {
    throw new Error('Ответ слишком большой');
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length > MAX_BYTES) {
    throw new Error('Ответ слишком большой');
  }

  return buffer.toString('utf8');
};

export const fetchPublic = async (
  rawUrl: string,
  init?: RequestInit,
): Promise<{ url: string; status: number; contentType: string; body: string }> => {
  let current = assertPublicHttpUrl(rawUrl).toString();
  let method = init?.method;
  let body = init?.body;

  for (let hop = 0; hop < 5; hop += 1) {
    const response = await fetch(current, {
      ...init,
      method,
      body,
      redirect: 'manual',
      headers: {
        Accept: 'text/html,application/json,text/plain;q=0.9,*/*;q=0.8',
        'User-Agent': USER_AGENT,
        ...(init?.headers || {}),
      },
      signal: init?.signal ?? AbortSignal.timeout(15_000),
    });

    const location = response.headers.get('location');

    if (response.status >= 300 && response.status < 400 && location) {
      current = assertPublicHttpUrl(new URL(location, current).toString()).toString();
      method = 'GET';
      body = undefined;
      continue;
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} для ${current}`);
    }

    return {
      url: current,
      status: response.status,
      contentType: response.headers.get('content-type') || '',
      body: await readLimited(response),
    };
  }

  throw new Error('Слишком много редиректов');
};
