import {
  extractTables,
  isThinPage,
  metaDescription,
  needsRender,
  pageTitle,
  readableText,
  stripHtml,
} from './html';
import { fetchPublic } from './fetch-public';
import { assertPublicHttpUrl } from './ssrf';
import { renderPageHtml } from '../browser/chromium';
import { humanText } from '../human-text';
import { unlockPage } from './unlocker';

export type PageSource = 'tavily-extract' | 'html' | 'chromium' | 'unlocker';

export type PageRead = {
  url: string;
  title: string;
  description: string;
  contentType: string;
  text: string;
  tables: string[][][];
  json?: unknown;
  rendered?: boolean;
  source: PageSource;
};

export type TavilyExtractHit = {
  url: string;
  text: string;
};

export const parseTavilyExtract = (body: string): TavilyExtractHit[] => {
  const parsed = JSON.parse(body) as {
    results?: Array<{ url?: string; raw_content?: string }>;
  };

  return (parsed.results ?? [])
    .map((item) => ({
      url: String(item.url || '').trim(),
      text: String(item.raw_content || '').trim(),
    }))
    .filter((item) => item.url && item.text);
};

const richer = (left: string, right: string): string =>
  left.replace(/\s+/g, ' ').trim().length >= right.replace(/\s+/g, ' ').trim().length
    ? left
    : right;

export const tavilyExtract = async (
  urls: string[],
  key: string,
): Promise<Map<string, string>> => {
  const targets = [...new Set(urls.map((url) => assertPublicHttpUrl(url).toString()))].slice(
    0,
    5,
  );

  if (!targets.length || !key) {
    return new Map();
  }

  const response = await fetchPublic('https://api.tavily.com/extract', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      api_key: key,
      urls: targets,
      extract_depth: 'advanced',
      include_images: false,
    }),
    timeoutMs: 40_000,
    retries: 1,
  });
  const found = new Map<string, string>();

  for (const item of parseTavilyExtract(response.body)) {
    found.set(item.url, item.text);

    try {
      found.set(assertPublicHttpUrl(item.url).toString(), item.text);
    } catch {
      // URL из ответа Tavily уже лежит под исходным ключом
    }
  }

  return found;
};

const joinText = (parts: string[], maxChars: number): string =>
  parts.filter(Boolean).join('\n\n').trim().slice(0, maxChars);

const fromHtml = (
  html: string,
  url: string,
  contentType: string,
  options: { full?: boolean; maxChars: number; rendered?: boolean; source: PageSource },
  liveText = '',
): PageRead => {
  const extracted = options.full ? stripHtml(html) : readableText(html);
  const tables = extractTables(html);
  const tableText = tables
    .map((table) => table.map((row) => row.join(' · ')).join('\n'))
    .filter(Boolean)
    .join('\n\n');
  const body = richer(liveText, extracted);

  return {
    url,
    title: pageTitle(html),
    description: metaDescription(html),
    contentType,
    text: joinText([body, tableText], options.maxChars),
    tables,
    rendered: options.rendered,
    source: options.source,
  };
};

const fromExtract = (
  url: string,
  text: string,
  maxChars: number,
): PageRead => ({
  url,
  title: '',
  description: '',
  contentType: 'text/plain',
  text: text.slice(0, maxChars),
  tables: [],
  source: 'tavily-extract',
});

/**
 * После индексатора: достать содержимое конкретной страницы.
 * Сначала Tavily Extract, если оболочка пустая — HTML, затем Chromium.
 */
export const readPage = async (options: {
  url: string;
  maxChars?: number;
  full?: boolean;
  tavilyKey?: string;
  /** ISO-код страны для Web Unlocker (резидентский прокси). */
  country?: string;
}): Promise<PageRead> => {
  const maxChars = Math.min(Math.max(options.maxChars || 12_000, 500), 40_000);
  const url = assertPublicHttpUrl(options.url).toString();

  if (options.tavilyKey) {
    try {
      const extracted = await tavilyExtract([url], options.tavilyKey);
      const text = extracted.get(url) || [...extracted.values()][0] || '';

      if (!isThinPage(text)) {
        return fromExtract(url, text, maxChars);
      }
    } catch {
      // Extract API недоступен — читаем страницу сами
    }
  }

  let response: Awaited<ReturnType<typeof fetchPublic>> | null = null;
  let blockedError: unknown;

  try {
    response = await fetchPublic(url);
  } catch (error) {
    // Сайт закрылся анти-ботом (403/429/503) или уронил соединение —
    // это как раз случай для Web Unlocker.
    blockedError = error;
  }

  if (response) {
    const type = response.contentType.toLowerCase();

    if (type.includes('application/json') || type.includes('+json')) {
      const json = JSON.parse(response.body) as unknown;

      return {
        url: response.url,
        title: '',
        description: '',
        contentType: response.contentType,
        text:
          humanText(json).slice(0, maxChars) ||
          JSON.stringify(json).slice(0, maxChars),
        tables: [],
        json,
        source: 'html',
      };
    }
  }

  const staticPage = response
    ? fromHtml(response.body, response.url, response.contentType, {
        full: options.full,
        maxChars,
        source: 'html',
      })
    : null;

  if (staticPage && !needsRender(response!.body, staticPage.text)) {
    return staticPage;
  }

  const staticText = staticPage?.text ?? '';

  // Этап 1: Scraping API (Web Unlocker) — резидентский прокси нужной страны,
  // обход Cloudflare и серверный рендер JS. Пробуем раньше локального Chromium:
  // он проходит там, где наш headless упирается в блок или гео-стену.
  try {
    const unlocked = await unlockPage(url, { country: options.country });

    if (unlocked && unlocked.html) {
      const parsed = fromHtml(unlocked.html, unlocked.url, 'text/html', {
        full: options.full,
        maxChars,
        rendered: true,
        source: 'unlocker',
      });

      if (!isThinPage(parsed.text) || parsed.text.length > staticText.length) {
        return parsed;
      }
    }
  } catch {
    // Unlocker не настроен или сервис не ответил — идём в локальный Chromium.
  }

  try {
    const rendered = await renderPageHtml(url);
    const parsed = fromHtml(
      rendered.html,
      rendered.url,
      'text/html',
      { full: options.full, maxChars, rendered: true, source: 'chromium' },
      rendered.text,
    );

    if (rendered.redirectedToRoot && isThinPage(parsed.text)) {
      // Глубокая ссылка увела на главную (гео/логин) и полезного текста нет —
      // честнее вернуть пометку, чем выдать контент не по адресу.
      return {
        ...parsed,
        text:
          parsed.text ||
          `Страница ${url} перенаправила на главную ${rendered.url} и не отдала контент без входа или из этого региона. Подключите Web Unlocker (WEB_UNLOCKER_PROVIDER) и укажите страну, чтобы обойти блок.`,
      };
    }

    if (!isThinPage(parsed.text) || parsed.text.length >= staticText.length) {
      return parsed;
    }
  } catch {
    // Playwright недоступен или страница не открылась — оставляем статику
  }

  if (staticPage) {
    return staticPage;
  }

  throw blockedError instanceof Error
    ? blockedError
    : new Error(`Не удалось загрузить ${url}`);
};
