const PRIVATE_V4 = [
  /^localhost$/i,
  /^127\./,
  /^0\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
];

export const USER_AGENT =
  process.env['WEB_USER_AGENT'] ||
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

export const assertPublicHttpUrl = (raw: string): URL => {
  let parsed: URL;

  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('Некорректный URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Разрешены только http и https');
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();

  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '::1' ||
    host === '0.0.0.0' ||
    host === 'metadata.google.internal'
  ) {
    throw new Error('Этот хост нельзя запрашивать');
  }

  if (PRIVATE_V4.some((pattern) => pattern.test(host))) {
    throw new Error('Приватные адреса нельзя запрашивать');
  }

  return parsed;
};
