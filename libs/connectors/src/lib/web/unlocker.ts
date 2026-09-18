import { assertPublicHttpUrl } from './ssrf';

/**
 * Этап 1 — обход блокировок и гео-привязки. Мы не держим свои прокси и не
 * разгадываем капчи сами, а отправляем URL в специализированный Scraping API
 * (Web Unlocker). Он сам ротирует резидентские прокси нужной страны, проходит
 * Cloudflare и рендерит JavaScript, а нам отдаёт готовый HTML.
 *
 * Провайдер и ключ берём из .env, поэтому подключить любой сервис можно без
 * правок кода. Поддержаны ZenRows, ScrapingBee, ScraperAPI и произвольный
 * GET-шаблон (Scrapfly, Bright Data API и т. п.).
 */
export type UnlockerProvider =
  | 'zenrows'
  | 'scrapingbee'
  | 'scraperapi'
  | 'custom';

export type UnlockerConfig = {
  provider: UnlockerProvider;
  apiKey: string;
  /** ISO-код страны для резидентского прокси, например us, de, ru. */
  country?: string;
  /** Рендерить JavaScript на стороне сервиса. По умолчанию да. */
  render: boolean;
  /**
   * Платные резидентские прокси. По умолчанию выключены: на стартовом плане
   * ZenRows `premium_proxy` + страна часто зависают до таймаута.
   */
  premium: boolean;
  /**
   * Шаблон для provider=custom. Плейсхолдеры: {url} {key} {country}.
   * {url} подставляется в URL-энкодированном виде.
   */
  template?: string;
};

export type UnlockRequest = {
  endpoint: string;
  headers: Record<string, string>;
  timeoutMs: number;
};

const bool = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value === '') {
    return fallback;
  }

  return !/^(0|false|no|off)$/i.test(value.trim());
};

const KNOWN: ReadonlySet<UnlockerProvider> = new Set([
  'zenrows',
  'scrapingbee',
  'scraperapi',
  'custom',
]);

const normalizeProvider = (value: string | undefined): UnlockerProvider | null => {
  const id = (value || '').trim().toLowerCase();

  if (id === 'brightdata' || id === 'bright-data' || id === 'scrapfly') {
    // У этих сервисов свой endpoint — задаётся через WEB_UNLOCKER_URL шаблоном.
    return 'custom';
  }

  return KNOWN.has(id as UnlockerProvider) ? (id as UnlockerProvider) : null;
};

/** Конфиг Web Unlocker из окружения. null — фича выключена. */
export const unlockerConfig = (
  env: NodeJS.ProcessEnv = process.env,
): UnlockerConfig | null => {
  const provider = normalizeProvider(env['WEB_UNLOCKER_PROVIDER']);
  const apiKey = (env['WEB_UNLOCKER_KEY'] || '').trim();

  if (!provider || !apiKey) {
    return null;
  }

  const template = (env['WEB_UNLOCKER_URL'] || '').trim() || undefined;

  if (provider === 'custom' && !template) {
    return null;
  }

  return {
    provider,
    apiKey,
    country: (env['WEB_UNLOCKER_COUNTRY'] || '').trim().toLowerCase() || undefined,
    render: bool(env['WEB_UNLOCKER_RENDER'], true),
    premium: bool(env['WEB_UNLOCKER_PREMIUM'], false),
    template,
  };
};

const applyTemplate = (
  template: string,
  url: string,
  config: UnlockerConfig,
  country: string,
): string =>
  template
    .replace(/\{url\}/g, encodeURIComponent(url))
    .replace(/\{key\}/g, encodeURIComponent(config.apiKey))
    .replace(/\{country\}/g, encodeURIComponent(country));

/**
 * Собирает HTTP-запрос к Scraping API под конкретного провайдера. Чистая
 * функция — её удобно проверять тестами без сети.
 */
export const buildUnlockRequest = (
  targetUrl: string,
  config: UnlockerConfig,
  country?: string,
): UnlockRequest => {
  const url = assertPublicHttpUrl(targetUrl).toString();
  const geo = (country || config.country || '').trim().toLowerCase();
  const timeoutMs = 22_000;
  const headers = { Accept: 'text/html,application/json,*/*' };

  if (config.provider === 'custom') {
    return {
      endpoint: applyTemplate(config.template ?? '', url, config, geo),
      headers,
      timeoutMs,
    };
  }

  if (config.provider === 'zenrows') {
    const params = new URLSearchParams({ apikey: config.apiKey, url });

    if (config.render) {
      params.set('js_render', 'true');
    }

    if (config.premium) {
      params.set('premium_proxy', 'true');
    }

    if (geo && config.premium) {
      params.set('proxy_country', geo);
    }

    return {
      endpoint: `https://api.zenrows.com/v1/?${params.toString()}`,
      headers,
      timeoutMs,
    };
  }

  if (config.provider === 'scrapingbee') {
    const params = new URLSearchParams({ api_key: config.apiKey, url });

    params.set('render_js', config.render ? 'true' : 'false');

    if (config.premium) {
      params.set('premium_proxy', 'true');
    }

    if (geo) {
      params.set('country_code', geo);
    }

    return {
      endpoint: `https://app.scrapingbee.com/api/v1/?${params.toString()}`,
      headers,
      timeoutMs,
    };
  }

  const params = new URLSearchParams({ api_key: config.apiKey, url });

  params.set('render', config.render ? 'true' : 'false');

  if (config.premium) {
    params.set('premium', 'true');
  }

  if (geo) {
    params.set('country_code', geo);
  }

  return {
    endpoint: `https://api.scraperapi.com/?${params.toString()}`,
    headers,
    timeoutMs,
  };
};

/** Несколько попыток: с JS/страной, затем проще — чтобы не висеть на premium. */
export const unlockVariants = (
  config: UnlockerConfig,
  country?: string,
): UnlockerConfig[] => {
  const geo = (country || config.country || '').trim().toLowerCase() || undefined;
  const seen = new Set<string>();
  const variants: UnlockerConfig[] = [];
  const add = (over: Partial<UnlockerConfig>) => {
    const next = { ...config, ...over };
    const key = `${next.render}|${next.premium}|${next.country || ''}`;

    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    variants.push(next);
  };

  add({
    render: config.render,
    premium: config.premium,
    country: config.premium ? geo : undefined,
  });

  if (geo || config.premium) {
    add({ render: config.render, premium: false, country: undefined });
  }

  add({ render: false, premium: false, country: undefined });

  return variants.slice(0, 3);
};

export type UnlockedPage = {
  url: string;
  html: string;
  status: number;
  provider: UnlockerProvider;
};

const errorMessage = (status: number, body: string): string => {
  const trimmed = body.trim();

  try {
    const parsed = JSON.parse(trimmed) as {
      title?: string;
      detail?: string;
      message?: string;
      code?: string;
    };
    const text = parsed.title || parsed.detail || parsed.message || '';

    return [parsed.code, text].filter(Boolean).join(': ') || `HTTP ${status}`;
  } catch {
    return trimmed.slice(0, 180) || `HTTP ${status}`;
  }
};

const looksLikeApiError = (status: number, body: string): boolean => {
  if (status >= 400) {
    return true;
  }

  const trimmed = body.trim();

  return (
    trimmed.startsWith('{') &&
    /"code"\s*:|"status"\s*:\s*4\d\d/.test(trimmed.slice(0, 400))
  );
};

const fetchUnlock = async (
  request: UnlockRequest,
): Promise<{ status: number; body: string }> => {
  const response = await fetch(request.endpoint, {
    headers: request.headers,
    signal: AbortSignal.timeout(request.timeoutMs),
    redirect: 'follow',
  });
  const body = await response.text();

  return { status: response.status, body };
};

/**
 * Скачивает HTML страницы через Scraping API. Возвращает null, если фича
 * выключена (нет ключа/провайдера в .env). Ошибки сети/сервиса пробрасывает —
 * вызывающий код решает, откатываться ли на Chromium.
 */
export const unlockPage = async (
  targetUrl: string,
  options: { country?: string; config?: UnlockerConfig | null } = {},
): Promise<UnlockedPage | null> => {
  const config = options.config ?? unlockerConfig();

  if (!config) {
    return null;
  }

  let lastError = '';

  for (const variant of unlockVariants(config, options.country)) {
    const request = buildUnlockRequest(targetUrl, variant);
    try {
      const response = await fetchUnlock(request);

      if (looksLikeApiError(response.status, response.body)) {
        lastError = errorMessage(response.status, response.body);
        continue;
      }

      if (!response.body.trim()) {
        lastError = 'пустой ответ';
        continue;
      }

      return {
        url: targetUrl,
        html: response.body,
        status: response.status,
        provider: config.provider,
      };
    } catch (error) {
      lastError =
        error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(
    `Web Unlocker (${config.provider}): ${lastError || 'не удалось получить страницу'}`,
  );
};
