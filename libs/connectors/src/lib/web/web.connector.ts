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
import { normalizeQuery } from './query';
import { bestchangeRates } from './bestchange';

const searchConfig = (credentials: Record<string, string>): SearchConfig => ({
  braveKey: firstNonEmpty(credentials['braveApiKey'], process.env['BRAVE_API_KEY']),
  googleKey: firstNonEmpty(
    credentials['googleApiKey'],
    process.env['GOOGLE_SEARCH_API_KEY'],
  ),
  googleCx: firstNonEmpty(credentials['googleCx'], process.env['GOOGLE_SEARCH_CX']),
  serperKey: firstNonEmpty(credentials['serperApiKey'], process.env['SERPER_API_KEY']),
  tavilyKey: firstNonEmpty(credentials['tavilyApiKey'], process.env['TAVILY_API_KEY']),
  allowScrape: credentials['allowScrape'] !== 'false',
  allowBrowser: credentials['allowBrowser'] !== 'false',
  allowWikipedia: credentials['allowWikipedia'] !== 'false',
});

const searchQuery = (
  params: Record<string, unknown>,
  previous: unknown,
): string => {
  const ctx = mergeContext(params, previous);
  const fromPrevious =
    previous && typeof previous === 'object'
      ? firstNonEmpty(
          (previous as Record<string, unknown>)['query'],
          (previous as Record<string, unknown>)['inn'],
          (previous as Record<string, unknown>)['text'],
          (previous as Record<string, unknown>)['subject'],
        )
      : typeof previous === 'string'
        ? previous
        : '';

  return normalizeQuery(firstNonEmpty(ctx['query'], ctx['q'], fromPrevious));
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
  const first = results[0] || {};

  return firstNonEmpty(
    ctx['url'],
    record['url'],
    first['url'],
    typeof previous === 'string' && previous.startsWith('http')
      ? previous
      : '',
  );
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
    'Поиск и чтение публичных страниц: ИНН, BestChange, справки. Структуру из текста достаёт llm.extract',
  credentialFields: [
    {
      key: 'braveApiKey',
      label: 'Brave Search API (рекомендуется)',
      secret: true,
      placeholder: 'brave.com/search/api — 2000 запросов/мес бесплатно',
    },
    {
      key: 'googleApiKey',
      label: 'Google Custom Search API key',
      secret: true,
      placeholder: 'console.cloud.google.com → Custom Search API',
    },
    {
      key: 'googleCx',
      label: 'Google CSE id (cx)',
      placeholder: 'programmablesearchengine.google.com',
    },
    {
      key: 'serperApiKey',
      label: 'Serper.dev API key (Google-выдача)',
      secret: true,
    },
    {
      key: 'tavilyApiKey',
      label: 'Tavily API key (поиск с текстом страниц)',
      secret: true,
    },
    {
      key: 'allowScrape',
      label: 'Разрешить бесплатные DuckDuckGo/Mojeek (true/false)',
      placeholder: 'true',
    },
    {
      key: 'allowBrowser',
      label: 'Резерв через Chromium, если поисковик блокирует (true/false)',
      placeholder: 'true',
    },
  ],
  actions: [
    {
      id: 'search',
      name: 'Найти в вебе',
      description:
        'Публичный поиск с перебором провайдеров, дедупом и подгрузкой текста страниц. Результат: results[] и готовый text',
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
          description: 'Подгрузить текст страниц из выдачи (по умолчанию true)',
        },
        contentLimit: {
          type: 'number',
          description: 'Сколько страниц подгружать, по умолчанию 3',
        },
        provider: {
          type: 'string',
          description:
            'Форсировать провайдера: brave | google | serper | tavily | duckduckgo | mojeek | browser | wikipedia',
        },
      },
    },
    {
      id: 'fetch',
      name: 'Открыть страницу',
      description:
        'Скачать публичный URL и вернуть текст и таблицы. url или первый результат search',
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
      },
    },
    {
      id: 'rates',
      name: 'Курсы BestChange',
      description:
        'BTC/LTC/USDT → RUB из api.bestchange.ru/info.zip, без JS-страницы',
      paramsSchema: {},
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

        const data = await webSearch({
          query,
          limit: Number(params['limit'] || 5),
          site: firstNonEmpty(params['site']),
          lang: firstNonEmpty(params['lang']) || 'ru',
          region: firstNonEmpty(params['region']) || 'ru',
          freshness: firstNonEmpty(params['freshness']) || undefined,
          provider: firstNonEmpty(params['provider']) || undefined,
          fetchContent: flag(params['fetchContent'], true),
          contentLimit: Number(params['contentLimit'] || 3),
          config: searchConfig(input.credentials),
        });

        return { ok: true, data };
      }

      if (input.action === 'fetch') {
        const url = fetchUrl(params, input.previousResult);

        if (!url) {
          return { ok: false, error: 'Не указан url для web.fetch' };
        }

        const data = await webFetch({
          url,
          maxChars: Number(params['maxChars'] || 12_000),
          full: flag(params['full'], false),
        });

        return { ok: true, data };
      }

      if (input.action === 'rates') {
        const data = await bestchangeRates();

        return { ok: true, data };
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
