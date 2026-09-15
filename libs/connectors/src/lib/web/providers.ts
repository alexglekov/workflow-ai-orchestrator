import { chromium } from 'playwright';
import { decodeEntities, stripHtml } from './html';
import { fetchPublic } from './fetch-public';
import { isUsableUrl } from './rank';
import { looksRelevant } from './relevance';
import type { SearchHit } from './rank';
import { groundedWebSearch } from '../llm/grounded-search';
import { resolveLlm, type ResolvedLlm } from '../llm/resolve';

export type SearchConfig = {
  braveKey?: string;
  googleKey?: string;
  googleCx?: string;
  serperKey?: string;
  tavilyKey?: string;
  allowScrape?: boolean;
  allowBrowser?: boolean;
  allowWikipedia?: boolean;
  allowLlmSearch?: boolean;
  llm?: ResolvedLlm;
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

const llmSearch: SearchProvider = {
  id: 'llm',
  keyed: true,
  enabled: (config) => {
    if (config.allowLlmSearch === false) {
      return false;
    }

    const llm = config.llm ?? resolveLlm();

    return Boolean(llm.apiKey);
  },
  run: async (options, config) => {
    const found = await groundedWebSearch(
      options.query,
      config.llm ?? resolveLlm(),
    );

    if (!found.results.length) {
      throw new Error(`${found.provider}: поиск модели не вернул ссылок`);
    }

    return found.results.map((item) => ({
      ...item,
      provider: 'llm',
      text: item.text || found.text,
    }));
  },
};

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

/** Bing прячет целевой URL в параметре u=a1… (base64). */
export const decodeBingUrl = (href: string): string => {
  const cleaned = decodeEntities(href);

  try {
    const parsed = new URL(cleaned, 'https://www.bing.com');
    const encoded = parsed.searchParams.get('u');

    if (encoded?.startsWith('a1')) {
      const payload = encoded.slice(2);
      const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
      const decoded = Buffer.from(padded, 'base64').toString('utf8').trim();

      if (/^https?:\/\//i.test(decoded)) {
        return decoded;
      }
    }

    if (/^https?:\/\//i.test(cleaned) && !/bing\.com\/ck\//i.test(cleaned)) {
      return cleaned;
    }
  } catch {
    // fall through
  }

  return cleaned;
};

export const parseBingHtml = (html: string): SearchHit[] => {
  const results: SearchHit[] = [];

  for (const match of html.matchAll(/<li class="b_algo"[\s\S]*?<\/li>/gi)) {
    const block = match[0];
    const link = /<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(
      block,
    );

    if (!link) {
      continue;
    }

    const snippet =
      /<p class="b_lineclamp\d+"[^>]*>([\s\S]*?)<\/p>/i.exec(block) ||
      /class="b_caption"[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i.exec(block);

    results.push(
      hit('bing', link[2], decodeBingUrl(link[1]), snippet?.[1] ?? ''),
    );
  }

  return results;
};

const bing: SearchProvider = {
  id: 'bing',
  keyed: false,
  enabled: (config) => config.allowScrape !== false,
  run: async (options) => {
    const params = new URLSearchParams({
      q: options.query,
      setlang: options.lang === 'ru' ? 'ru' : 'en-US',
      count: String(Math.min(Math.max(options.limit, 5), 20)),
    });

    if (options.freshness === 'day') {
      params.set('filters', 'ex1:"ez1"');
    } else if (options.freshness === 'week') {
      params.set('filters', 'ex1:"ez2"');
    } else if (options.freshness === 'month') {
      params.set('filters', 'ex1:"ez3"');
    }

    const search = async (cookie?: string) => {
      const response = await fetchPublic(
        `https://www.bing.com/search?${params.toString()}`,
        {
          timeoutMs: options.timeoutMs,
          ...(cookie ? { headers: { Cookie: cookie } } : {}),
        },
      );

      if (
        /captcha|challenge|Attention Required/i.test(response.body) &&
        !/<li class="b_algo"/i.test(response.body)
      ) {
        throw blocked('bing');
      }

      return parseBingHtml(response.body);
    };

    const first = await search();

    if (first.length && looksRelevant(first, options.query)) {
      return first;
    }

    // Bing без сессии отвечает 200, но выдачей по чужому запросу.
    const home = await fetchPublic('https://www.bing.com/', {
      timeoutMs: options.timeoutMs,
      retries: 0,
    }).catch(() => undefined);
    const second = home?.cookie ? await search(home.cookie) : [];

    if (second.length && looksRelevant(second, options.query)) {
      return second;
    }

    if (!first.length && !second.length) {
      throw blocked('bing');
    }

    throw new Error('bing: выдача не относится к запросу');
  },
};

/** Brave отдаёт свой индекс и без ключа, но быстро включает 429. */
const braveHtml: SearchProvider = {
  id: 'brave-html',
  keyed: false,
  enabled: (config) => config.allowScrape !== false && !config.braveKey,
  run: async (options) => {
    const response = await fetchPublic(
      `https://search.brave.com/search?q=${encodeURIComponent(options.query)}`,
      { timeoutMs: options.timeoutMs, retries: 0 },
    );
    const results: SearchHit[] = [];

    for (const match of response.body.matchAll(
      /<a\b[^>]*href="(https?:\/\/[^"]+)"[^>]*>([\s\S]{0,400}?)<\/a>/gi,
    )) {
      const url = decodeEntities(match[1]);
      const title = text(match[2], 200);

      if (
        !title ||
        title.length < 12 ||
        !isUsableUrl(url) ||
        /brave\.com/i.test(url) ||
        results.some((item) => item.url === url)
      ) {
        continue;
      }

      results.push(hit('brave-html', title, url, ''));
    }

    if (!results.length) {
      throw blocked('brave-html');
    }

    return results;
  },
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

export const parseDdgHtml = (html: string): SearchHit[] => {
  const results: SearchHit[] = [];
  const blocks = html
    .split(/<div[^>]+class=["'][^"']*\bresults?_links?\b[^"']*["']/i)
    .slice(1);
  const source = blocks.length ? blocks : [html];

  for (const block of source) {
    const link =
      /<a[^>]*class=["'][^"']*\bresult__a\b[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i.exec(
        block,
      ) ||
      /<a[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*\bresult__a\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/i.exec(
        block,
      );

    if (!link) {
      continue;
    }

    const snippet =
      /class=["'][^"']*\bresult__snippet\b[^"']*["'][^>]*>([\s\S]*?)<\/(?:a|td|div|span)>/i.exec(
        block,
      );

    results.push(hit('duckduckgo', link[2], decodeDdg(link[1]), snippet?.[1] ?? ''));
  }

  return results;
};

/** DDG Lite пишет атрибуты в одинарных кавычках, поэтому кавычка — любая. */
export const parseDdgLite = (html: string): SearchHit[] => {
  const results: SearchHit[] = [];
  const links = [
    ...html.matchAll(
      /<a[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*\bresult-link\b[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi,
    ),
  ];
  const snippets = [
    ...html.matchAll(
      /class=["'][^"']*\bresult-snippet\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/gi,
    ),
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
    const params = new URLSearchParams({
      q: options.query,
      kl: ddgRegion(options),
    });

    if (options.freshness === 'day') {
      params.set('df', 'd');
    } else if (options.freshness === 'week') {
      params.set('df', 'w');
    } else if (options.freshness === 'month') {
      params.set('df', 'm');
    }

    const response = await fetchPublic(
      `https://lite.duckduckgo.com/lite/?${params.toString()}`,
      { timeoutMs: options.timeoutMs },
    );
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
 * Как человек в браузере: настоящий Chromium с JS, cookies и живой вёрсткой.
 * Bing идёт первым: Google в headless почти всегда отвечает капчей.
 */
const SEARCH_ENGINES = [
  {
    name: 'bing',
    url: (options: SearchOptions) =>
      `https://www.bing.com/search?q=${encodeURIComponent(options.query)}&setlang=${
        options.lang === 'ru' ? 'ru' : 'en-US'
      }`,
    ready: 'li.b_algo h2 a',
    scrape: 'li.b_algo',
  },
  {
    name: 'duckduckgo',
    url: (options: SearchOptions) =>
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(options.query)}&kl=${ddgRegion(
        options,
      )}`,
    ready: '.result__a, [data-testid="result-title-a"]',
    scrape: '.result, article[data-testid="result"], li[data-layout="organic"]',
  },
  {
    name: 'google',
    url: (options: SearchOptions) =>
      `https://www.google.com/search?q=${encodeURIComponent(options.query)}&hl=${
        options.lang
      }&gl=${options.region}&num=20`,
    ready: '#search a h3, #rso a h3',
    scrape: '#rso div[data-hveid], #search div[data-hveid]',
  },
];

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
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        viewport: { width: 1280, height: 900 },
      });
      const page = await context.newPage();
      const errors: string[] = [];

      for (const engine of SEARCH_ENGINES) {
        try {
          await page.goto(engine.url(options), {
            waitUntil: 'domcontentloaded',
            timeout: options.timeoutMs,
          });
          await page
            .waitForSelector(engine.ready, {
              timeout: Math.min(options.timeoutMs, 5_000),
            })
            .catch(() => undefined);

          // В headless innerText часто пуст, поэтому читаем textContent.
          const raw = await page.evaluate((selector) =>
            [...document.querySelectorAll(selector)]
              .map((node) => {
                const link = node.querySelector<HTMLAnchorElement>('a[href]');
                const heading = node.querySelector('h2, h3');
                const snippet = node.querySelector(
                  '[data-result="snippet"], .b_lineclamp2, .b_lineclamp3, .result__snippet, div[data-sncf], .VwiC3b',
                );

                return {
                  title: (
                    heading?.textContent ||
                    link?.textContent ||
                    ''
                  ).trim(),
                  url: link?.href ?? '',
                  snippet: (snippet?.textContent || '').trim(),
                };
              })
              .filter((item) => item.url && item.title),
          engine.scrape);
          const results = raw
            .map((item) =>
              hit(
                'browser',
                item.title,
                // Bing и DDG подменяют href редиректом — разворачиваем в целевой URL.
                decodeDdg(decodeBingUrl(item.url)),
                item.snippet,
              ),
            )
            .filter(
              (item) =>
                isUsableUrl(item.url) &&
                !/^https?:\/\/(?:www\.|html\.)?(?:google|bing|duckduckgo)\.com/i.test(
                  item.url,
                ),
            );

          if (results.length && looksRelevant(results, options.query)) {
            return results;
          }

          errors.push(
            results.length
              ? `${engine.name}: выдача не по запросу`
              : `${engine.name}: пусто`,
          );
        } catch (error) {
          errors.push(
            `${engine.name}: ${
              error instanceof Error ? error.message.slice(0, 80) : 'ошибка'
            }`,
          );
        }
      }

      throw new Error(`browser: ни один поисковик не отдал выдачу (${errors.join('; ')})`);
    } finally {
      await browser.close().catch(() => undefined);
    }
  },
};

/** Сначала поиск выбранной модели (Gemini Google Search / Qwen), затем ключи и скрейп. */
export const SEARCH_PROVIDERS: SearchProvider[] = [
  brave,
  googleCse,
  serper,
  tavily,
  llmSearch,
  duckduckgoLite,
  bing,
  browserSearch,
  braveHtml,
  duckduckgo,
  mojeek,
  wikipedia,
];

export const providerById = (id: string): SearchProvider | undefined =>
  SEARCH_PROVIDERS.find((provider) => provider.id === id);
