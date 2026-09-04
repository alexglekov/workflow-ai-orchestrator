import { chromium } from 'playwright';
import { decodeEntities, stripHtml } from './html';
import { fetchPublic } from './fetch-public';
import { isUsableUrl } from './rank';
import type { SearchHit } from './rank';

export type SearchConfig = {
  braveKey?: string;
  googleKey?: string;
  googleCx?: string;
  serperKey?: string;
  tavilyKey?: string;
  allowScrape?: boolean;
  allowBrowser?: boolean;
  allowWikipedia?: boolean;
};

export type SearchOptions = {
  query: string;
  limit: number;
  lang: string;
  region: string;
  freshness?: string;
  timeoutMs: number;
};

export type SearchProvider = {
  id: string;
  keyed: boolean;
  enabled: (config: SearchConfig) => boolean;
  run: (options: SearchOptions, config: SearchConfig) => Promise<SearchHit[]>;
};

const text = (value: unknown, max: number): string =>
  decodeEntities(stripHtml(String(value ?? ''))).replace(/\s+/g, ' ').trim().slice(0, max);

const hit = (
  provider: string,
  title: unknown,
  url: unknown,
  snippet: unknown,
  body?: unknown,
): SearchHit => ({
  provider,
  title: text(title, 200),
  url: String(url ?? '').trim(),
  snippet: text(snippet, 400),
  ...(body ? { text: text(body, 4000) } : {}),
});

const freshnessMap: Record<string, { brave: string; google: string; serper: string }> = {
  day: { brave: 'pd', google: 'd1', serper: 'qdr:d' },
  week: { brave: 'pw', google: 'w1', serper: 'qdr:w' },
  month: { brave: 'pm', google: 'm1', serper: 'qdr:m' },
  year: { brave: 'py', google: 'y1', serper: 'qdr:y' },
};

const blocked = (provider: string): Error =>
  new Error(`${provider}: запрос отклонён анти-ботом, результатов нет`);

const brave: SearchProvider = {
  id: 'brave',
  keyed: true,
  enabled: (config) => Boolean(config.braveKey),
  run: async (options, config) => {
    const params = new URLSearchParams({
      q: options.query,
      count: String(options.limit),
      country: options.region.toUpperCase(),
      search_lang: options.lang,
      safesearch: 'off',
      text_decorations: 'false',
    });
    const fresh = options.freshness && freshnessMap[options.freshness]?.brave;

    if (fresh) {
      params.set('freshness', fresh);
    }

    const response = await fetchPublic(
      `https://api.search.brave.com/res/v1/web/search?${params.toString()}`,
      {
        headers: {
          Accept: 'application/json',
          'X-Subscription-Token': config.braveKey as string,
        },
        timeoutMs: options.timeoutMs,
      },
    );
    const parsed = JSON.parse(response.body) as {
      web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
    };

    return (parsed.web?.results ?? []).map((item) =>
      hit('brave', item.title, item.url, item.description),
    );
  },
};

const googleCse: SearchProvider = {
  id: 'google',
  keyed: true,
  enabled: (config) => Boolean(config.googleKey && config.googleCx),
  run: async (options, config) => {
    const params = new URLSearchParams({
      key: config.googleKey as string,
      cx: config.googleCx as string,
      q: options.query,
      num: String(Math.min(options.limit, 10)),
      hl: options.lang,
      gl: options.region,
      safe: 'off',
    });
    const fresh = options.freshness && freshnessMap[options.freshness]?.google;

    if (fresh) {
      params.set('dateRestrict', fresh);
    }

    const response = await fetchPublic(
      `https://www.googleapis.com/customsearch/v1?${params.toString()}`,
      { headers: { Accept: 'application/json' }, timeoutMs: options.timeoutMs },
    );
    const parsed = JSON.parse(response.body) as {
      items?: Array<{ title?: string; link?: string; snippet?: string }>;
    };

    return (parsed.items ?? []).map((item) =>
      hit('google', item.title, item.link, item.snippet),
    );
  },
};

const serper: SearchProvider = {
  id: 'serper',
  keyed: true,
  enabled: (config) => Boolean(config.serperKey),
  run: async (options, config) => {
    const fresh = options.freshness && freshnessMap[options.freshness]?.serper;
    const response = await fetchPublic('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': config.serperKey as string,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        q: options.query,
        num: options.limit,
        hl: options.lang,
        gl: options.region,
        ...(fresh ? { tbs: fresh } : {}),
      }),
      timeoutMs: options.timeoutMs,
    });
    const parsed = JSON.parse(response.body) as {
      organic?: Array<{ title?: string; link?: string; snippet?: string }>;
      answerBox?: { answer?: string; snippet?: string; link?: string; title?: string };
    };
    const results = (parsed.organic ?? []).map((item) =>
      hit('serper', item.title, item.link, item.snippet),
    );
    const answer = parsed.answerBox;

    if (answer?.link && (answer.answer || answer.snippet)) {
      results.unshift(
        hit('serper', answer.title || options.query, answer.link, answer.answer || answer.snippet),
      );
    }

    return results;
  },
};

const tavily: SearchProvider = {
  id: 'tavily',
  keyed: true,
  enabled: (config) => Boolean(config.tavilyKey),
  run: async (options, config) => {
    const response = await fetchPublic('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${config.tavilyKey}`,
      },
      body: JSON.stringify({
        query: options.query,
        max_results: options.limit,
        search_depth: 'advanced',
        include_answer: false,
        ...(options.freshness === 'day' ? { days: 1 } : {}),
      }),
      timeoutMs: options.timeoutMs,
    });
    const parsed = JSON.parse(response.body) as {
      results?: Array<{ title?: string; url?: string; content?: string; raw_content?: string }>;
    };

    return (parsed.results ?? []).map((item) =>
      hit('tavily', item.title, item.url, item.content, item.raw_content || item.content),
    );
  },
};

const anchorsFrom = (html: string, provider: string): SearchHit[] => {
  const seen = new Set<string>();
  const results: SearchHit[] = [];

  for (const match of html.matchAll(
    /<a\b[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
  )) {
    const url = decodeEntities(match[1]);
    const title = text(match[2], 200);

    if (!title || title.length < 12 || !isUsableUrl(url) || seen.has(url)) {
      continue;
    }

    seen.add(url);
    results.push(hit(provider, title, url, ''));
  }

  return results;
};

const decodeDdg = (href: string): string => {
  try {
    const parsed = new URL(decodeEntities(href), 'https://duckduckgo.com');
    const target = parsed.searchParams.get('uddg');

    return target ? decodeURIComponent(target) : parsed.toString();
  } catch {
    return href;
  }
};

const parseDdgHtml = (html: string): SearchHit[] => {
  const results: SearchHit[] = [];
  const blocks = html.split(/<div[^>]+class="[^"]*\bresults?_links?\b[^"]*"/i).slice(1);
  const source = blocks.length ? blocks : [html];

  for (const block of source) {
    const link = /<a[^>]*class="[^"]*\bresult__a\b[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(
      block,
    );

    if (!link) {
      continue;
    }

    const snippet = /class="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/(?:a|td|div|span)>/i.exec(
      block,
    );

    results.push(hit('duckduckgo', link[2], decodeDdg(link[1]), snippet?.[1] ?? ''));
  }

  return results;
};

const parseDdgLite = (html: string): SearchHit[] => {
  const results: SearchHit[] = [];
  const links = [
    ...html.matchAll(
      /<a[^>]*class="[^"]*\bresult-link\b[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    ),
  ];
  const snippets = [
    ...html.matchAll(/class="[^"]*\bresult-snippet\b[^"]*"[^>]*>([\s\S]*?)<\/td>/gi),
  ];

  links.forEach((link, index) => {
    results.push(
      hit('duckduckgo-lite', link[2], decodeDdg(link[1]), snippets[index]?.[1] ?? ''),
    );
  });

  return results;
};

const ddgRegion = (options: SearchOptions): string =>
  options.region === 'ru' ? 'ru-ru' : `${options.region}-${options.region}`;

const duckduckgo: SearchProvider = {
  id: 'duckduckgo',
  keyed: false,
  enabled: (config) => config.allowScrape !== false,
  run: async (options) => {
    const body = new URLSearchParams({
      q: options.query,
      kl: ddgRegion(options),
      df: options.freshness === 'day' ? 'd' : options.freshness === 'week' ? 'w' : '',
    });
    const response = await fetchPublic('https://html.duckduckgo.com/html/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      timeoutMs: options.timeoutMs,
    });
    const results = parseDdgHtml(response.body);

    if (!results.length) {
      throw blocked('duckduckgo');
    }

    return results;
  },
};

const duckduckgoLite: SearchProvider = {
  id: 'duckduckgo-lite',
  keyed: false,
  enabled: (config) => config.allowScrape !== false,
  run: async (options) => {
    const response = await fetchPublic('https://lite.duckduckgo.com/lite/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ q: options.query, kl: ddgRegion(options) }).toString(),
      timeoutMs: options.timeoutMs,
    });
    const results = parseDdgLite(response.body);

    if (!results.length) {
      throw blocked('duckduckgo-lite');
    }

    return results;
  },
};

const mojeek: SearchProvider = {
  id: 'mojeek',
  keyed: false,
  enabled: (config) => config.allowScrape !== false,
  run: async (options) => {
    const response = await fetchPublic(
      `https://www.mojeek.com/search?q=${encodeURIComponent(options.query)}`,
      { timeoutMs: options.timeoutMs },
    );

    if (/<title>\s*captcha/i.test(response.body)) {
      throw blocked('mojeek');
    }

    const list = /<ul[^>]*class="[^"]*results-standard[^"]*"[\s\S]*?<\/ul>/i.exec(
      response.body,
    );
    const results = anchorsFrom(list?.[0] ?? response.body, 'mojeek');

    if (!results.length) {
      throw blocked('mojeek');
    }

    return results;
  },
};

const wikipedia: SearchProvider = {
  id: 'wikipedia',
  keyed: false,
  enabled: (config) => config.allowWikipedia !== false,
  run: async (options) => {
    const params = new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: options.query,
      srlimit: String(options.limit),
      format: 'json',
      origin: '*',
    });
    const response = await fetchPublic(
      `https://${options.lang}.wikipedia.org/w/api.php?${params.toString()}`,
      { headers: { Accept: 'application/json' }, timeoutMs: options.timeoutMs },
    );
    const parsed = JSON.parse(response.body) as {
      query?: { search?: Array<{ title?: string; snippet?: string }> };
    };

    return (parsed.query?.search ?? []).map((item) =>
      hit(
        'wikipedia',
        item.title,
        `https://${options.lang}.wikipedia.org/wiki/${encodeURIComponent(
          String(item.title ?? '').replace(/ /g, '_'),
        )}`,
        item.snippet,
      ),
    );
  },
};

/**
 * Последний рубеж: настоящий Chromium проходит анти-бот там, где обычный
 * HTTP-запрос с серверного IP получает заглушку.
 */
const browserSearch: SearchProvider = {
  id: 'browser',
  keyed: false,
  enabled: (config) => config.allowBrowser !== false,
  run: async (options) => {
    const browser = await chromium.launch({
      headless: true,
      executablePath:
        process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'] || undefined,
      args: ['--disable-dev-shm-usage', '--no-sandbox'],
    });

    try {
      const context = await browser.newContext({
        locale: `${options.lang}-${options.region.toUpperCase()}`,
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      });
      const page = await context.newPage();
      const url = `https://duckduckgo.com/?q=${encodeURIComponent(
        options.query,
      )}&kl=${ddgRegion(options)}&ia=web`;

      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs });
      await page
        .waitForSelector('[data-testid="result-title-a"], article[data-testid="result"]', {
          timeout: options.timeoutMs,
        })
        .catch(() => undefined);

      const raw = await page.evaluate(() =>
        [...document.querySelectorAll('article[data-testid="result"], li[data-layout="organic"]')]
          .map((node) => {
            const link = node.querySelector<HTMLAnchorElement>(
              'a[data-testid="result-title-a"], h2 a[href], a[href]',
            );
            const snippet = node.querySelector('[data-result="snippet"]');

            return {
              title: link?.innerText ?? '',
              url: link?.href ?? '',
              snippet: snippet instanceof HTMLElement ? snippet.innerText : '',
            };
          })
          .filter((item) => item.url),
      );
      const results = raw.map((item) =>
        hit('browser', item.title, item.url, item.snippet),
      );

      if (results.length) {
        return results;
      }

      // Вёрстка выдачи меняется — разбираем отрендеренный HTML как запасной путь.
      const fallback = anchorsFrom(await page.content(), 'browser').filter(
        (item) => !/duckduckgo\.com/i.test(item.url),
      );

      if (!fallback.length) {
        throw blocked('browser');
      }

      return fallback;
    } finally {
      await browser.close().catch(() => undefined);
    }
  },
};

/** Ключевые API идут первыми: они дают стабильную и точную выдачу. */
export const SEARCH_PROVIDERS: SearchProvider[] = [
  brave,
  googleCse,
  serper,
  tavily,
  duckduckgo,
  duckduckgoLite,
  mojeek,
  browserSearch,
  wikipedia,
];

export const providerById = (id: string): SearchProvider | undefined =>
  SEARCH_PROVIDERS.find((provider) => provider.id === id);
