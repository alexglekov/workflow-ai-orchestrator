import {
  Connector,
  ConnectorExecuteInput,
  ConnectorExecuteResult,
} from '../types';
import {
  firstNonEmpty,
  interpolate,
  mergeContext,
} from '../interpolate';
import { webFetch, webSearch, type SearchConfig } from './client';
import { searchFreshness, isSearchDump, shapeSearchQuery } from './query';
import { bestchangeRates } from './bestchange';
import { pickResultUrl, p2pPageUrl, bestchangePageUrl, exchangePair } from './site';
import { fetchP2pBook } from './p2p';
import { resolveLlm } from '../llm/resolve';

const searchConfig = (credentials: Record<string, string>): SearchConfig => ({
  tavilyKey: firstNonEmpty(credentials['tavilyApiKey'], process.env['TAVILY_API_KEY']),
  llm: resolveLlm(credentials),
});

const searchQuery = (
  params: Record<string, unknown>,
  previous: unknown,
): string => {
  const ctx = mergeContext(params, previous);
  const explicit = firstNonEmpty(ctx['query'], ctx['q']);
  const previousRecord =
    previous && typeof previous === 'object'
      ? (previous as Record<string, unknown>)
      : {};
  const fromPrevious = firstNonEmpty(
    previousRecord['query'],
    previousRecord['q'],
  );
  const raw =
    explicit && !isSearchDump(explicit)
      ? explicit
      : fromPrevious && !isSearchDump(fromPrevious)
        ? fromPrevious
        : explicit;

  return shapeSearchQuery(raw);
};

const fetchUrl = (
  params: Record<string, unknown>,
  previous: unknown,
): string => {
  const ctx = mergeContext(params, previous);
  const record =
    previous && typeof previous === 'object'
      ? (previous as Record<string, unknown>)
      : {};
  const results = Array.isArray(record['results'])
    ? (record['results'] as Array<Record<string, unknown>>)
    : [];
  const site = firstNonEmpty(ctx['site'], record['site']);
  const explicit = firstNonEmpty(
    ctx['url'],
    record['url'],
    typeof previous === 'string' && previous.startsWith('http')
      ? previous
      : '',
  );
  const hint = [
    firstNonEmpty(ctx['query'], record['query']),
    site,
    explicit,
  ]
    .filter(Boolean)
    .join(' ');
  const known = p2pPageUrl(hint) || bestchangePageUrl(hint);

  if (known) {
    return known;
  }

  const picked = pickResultUrl(results, site);
  const first = results[0] || {};

  if (site && picked) {
    return picked;
  }

  return firstNonEmpty(explicit, picked, first['url']);
};

const flag = (value: unknown, fallback: boolean): boolean => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return value !== false && value !== 'false' && value !== 0 && value !== '0';
};

export const webConnector: Connector = {
  id: 'web',
  name: 'Web',
  description:
    'Поиск через Tavily и чтение публичных страниц. Структуру из текста достаёт llm.extract',
  credentialFields: [
    {
      key: 'tavilyApiKey',
      label: 'Tavily API key',
      secret: true,
      placeholder: 'tavily.com/api-keys — обязателен для web.search',
    },
  ],
  actions: [
    {
      id: 'search',
      name: 'Найти в вебе',
      description:
        'Ищет в интернете через Tavily и возвращает answer/text и results[] со ссылками. Текст страниц снимает web.fetch',
      paramsSchema: {
        query: {
          type: 'string',
          required: true,
          description: 'Запрос. Можно {{previous.inn}} или {{item.text}}',
        },
        limit: { type: 'number', description: 'Число результатов, 1–20 (по умолчанию 5)' },
        site: { type: 'string', description: 'Ограничить доменом, например nalog.gov.ru' },
        lang: { type: 'string', description: 'Язык выдачи, по умолчанию ru' },
        region: { type: 'string', description: 'Регион выдачи, по умолчанию ru' },
        freshness: {
          type: 'string',
          description: 'day | week | month | year — только свежие страницы',
        },
        fetchContent: {
          type: 'boolean',
          description:
            'После поиска сразу снять текст страниц через Tavily Extract. Обычно не нужно: это делает web.fetch',
        },
        contentLimit: {
          type: 'number',
          description: 'Сколько страниц снимать, если fetchContent=true',
        },
      },
    },
    {
      id: 'fetch',
      name: 'Открыть страницу',
      description:
        'Снять текст страницы: Tavily Extract → HTML → Web Unlocker (Scraping API, обход блокировок и гео) → Chromium',
      paramsSchema: {
        url: {
          type: 'string',
          description: 'https://… или {{previous.results.0.url}}',
        },
        maxChars: {
          type: 'number',
          description: 'Обрезка текста, по умолчанию 12000',
        },
        full: {
          type: 'boolean',
          description: 'Весь текст вместе с меню и подвалом, по умолчанию false',
        },
        country: {
          type: 'string',
          description:
            'ISO-код страны для Web Unlocker (резидентский прокси), например us, de, ru. Помогает обойти гео-блок',
        },
      },
    },
    {
      id: 'rates',
      name: 'Курсы BestChange',
      description:
        'BTC/LTC/USDT → RUB из api.bestchange.ru/info.zip, без JS-страницы',
      paramsSchema: {
        from: { type: 'string', description: 'Исходная валюта, например USDT' },
        to: { type: 'string', description: 'Целевая валюта, например BTC' },
        limit: { type: 'number', description: 'Сколько предложений, по умолчанию 10' },
      },
    },
  ],
  testConnection: async (credentials) => {
    try {
      const result = await webSearch({
        query: 'BestChange USDT RUB',
        limit: 3,
        fetchContent: false,
        config: searchConfig(credentials),
      });

      return {
        ok: true,
        message: `${result.provider}: ${result.results.length} результатов, первый — ${result.results[0].title}`,
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Web search failed',
      };
    }
  },
  execute: async (
    input: ConnectorExecuteInput,
  ): Promise<ConnectorExecuteResult> => {
    const params = interpolate(
      input.params,
      input.context ?? input.previousResult,
    ) as Record<string, unknown>;

    try {
      if (input.action === 'search') {
        const query = searchQuery(params, input.previousResult);

        if (!query) {
          return { ok: false, error: 'Не указан query для web.search' };
        }

        const p2p = /p2p|п2п|оферт/i.test(query);
        const freshness =
          p2p && firstNonEmpty(params['freshness']) === 'day'
            ? 'week'
            : firstNonEmpty(params['freshness']) ||
              searchFreshness(`${query} ${firstNonEmpty(params['query'])}`);
        const data = await webSearch({
          query,
          limit: Number(params['limit'] || (freshness ? 8 : 5)),
          site: firstNonEmpty(params['site']),
          lang: firstNonEmpty(params['lang']) || 'ru',
          region: firstNonEmpty(params['region']) || 'ru',
          freshness,
          fetchContent: flag(params['fetchContent'], false),
          contentLimit: Number(params['contentLimit'] || 3),
          config: searchConfig(input.credentials),
        });

        return { ok: true, data };
      }

      if (input.action === 'fetch') {
        const ctx = mergeContext(params, input.previousResult);
        const record =
          input.previousResult && typeof input.previousResult === 'object'
            ? (input.previousResult as Record<string, unknown>)
            : {};
        const targetUrl = String(firstNonEmpty(params['url']) || '');
        const urlSignalsP2p = /\/otc\/|\/fiat\/trade\/|p2p[.-]|p2p-markets/i.test(
          targetUrl,
        );
        const p2pHint = [
          firstNonEmpty(ctx['query'], record['query']),
          firstNonEmpty(params['site'], record['site']),
          targetUrl,
          urlSignalsP2p ? 'p2p' : '',
        ]
          .filter(Boolean)
          .join(' ');
        const book = await fetchP2pBook(p2pHint).catch(() => null);

        if (book && book.offers.length) {
          return { ok: true, data: book };
        }

        const url = fetchUrl(params, input.previousResult);

        if (!url) {
          return { ok: false, error: 'Не указан url для web.fetch' };
        }

        const data = await webFetch({
          url,
          maxChars: Number(params['maxChars'] || 12_000),
          full: flag(params['full'], false),
          tavilyKey: searchConfig(input.credentials).tavilyKey,
          country: firstNonEmpty(params['country'], params['geo']) || undefined,
        });

        return { ok: true, data };
      }

      if (input.action === 'rates') {
        const ctx = mergeContext(params, input.previousResult);
        const hint = [
          firstNonEmpty(params['from'], ctx['from']),
          firstNonEmpty(params['to'], ctx['to']),
          firstNonEmpty(params['pair'], params['query'], ctx['query']),
        ]
          .filter(Boolean)
          .join(' ');
        const pair = exchangePair(`${hint} ${firstNonEmpty(params['from'])}/${firstNonEmpty(params['to'])}`.trim());
        const from =
          firstNonEmpty(params['from'], ctx['from']) || pair?.from || '';
        const to = firstNonEmpty(params['to'], ctx['to']) || pair?.to || '';
        const limit = Number(params['limit'] || 10);

        try {
          const data = await bestchangeRates({
            ...(from ? { from } : {}),
            ...(to ? { to } : {}),
            ...(from && to ? { limit } : {}),
          });

          return { ok: true, data };
        } catch (error) {
          const url =
            bestchangePageUrl(
              [hint, from && to ? `${from}/${to}` : '', 'bestchange'].join(' '),
            ) || 'https://www.bestchange.ru/';
          const page = await webFetch({
            url,
            maxChars: 12_000,
            tavilyKey: searchConfig(input.credentials).tavilyKey,
            country:
              firstNonEmpty(params['country'], params['geo']) || undefined,
          });

          return {
            ok: true,
            data: {
              ...page,
              source: page.source,
              text: page.text,
              warning:
                error instanceof Error
                  ? `zip BestChange недоступен (${error.message}), открыл страницу ${url}`
                  : `zip BestChange недоступен, открыл страницу ${url}`,
            },
          };
        }
      }

      return { ok: false, error: `Неизвестное действие: ${input.action}` };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Web connector error',
      };
    }
  },
};
