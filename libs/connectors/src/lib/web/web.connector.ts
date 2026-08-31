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
import { webFetch, webSearch } from './client';

const braveKey = (credentials: Record<string, string>) =>
  firstNonEmpty(
    credentials['braveApiKey'],
    process.env['BRAVE_API_KEY'],
  );

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
      : '';

  return firstNonEmpty(ctx['query'], fromPrevious);
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

export const webConnector: Connector = {
  id: 'web',
  name: 'Web',
  description:
    'Поиск и чтение публичных страниц: ИНН, BestChange, справки. Без отдельной CRM — лид пишите в 1С',
  credentialFields: [
    {
      key: 'braveApiKey',
      label: 'Brave Search API (необязательно)',
      secret: true,
      placeholder: 'Если пусто — DuckDuckGo HTML',
    },
  ],
  actions: [
    {
      id: 'search',
      name: 'Найти в вебе',
      description:
        'Публичный поиск. query или текст/ИНН с предыдущего шага',
      paramsSchema: {
        query: {
          type: 'string',
          required: true,
          description: 'Запрос. Можно {{previous.inn}} или {{item.text}}',
        },
        limit: { type: 'number', description: 'Число результатов, 1–10' },
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
      },
    },
  ],
  testConnection: async (credentials) => {
    try {
      const result = await webSearch({
        query: 'BestChange USDT RUB',
        limit: 1,
        braveKey: braveKey(credentials) || undefined,
      });

      if (!result.results.length) {
        return { ok: false, error: 'Поиск не вернул результатов' };
      }

      return {
        ok: true,
        message: `${result.provider}: ${result.results[0].title}`,
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

        const data = await webSearch({
          query,
          limit: Number(params['limit'] || 5),
          braveKey: braveKey(input.credentials) || undefined,
        });

        if (!data.results.length) {
          return { ok: false, error: 'Поиск не вернул результатов' };
        }

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
        });

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
