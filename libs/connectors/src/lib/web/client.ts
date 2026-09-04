import {
  extractTables,
  metaDescription,
  pageTitle,
  readableText,
  stripHtml,
} from './html';
import { fetchPublic } from './fetch-public';
import { buildQuery } from './query';
import { rankHits } from './rank';
import type { SearchHit } from './rank';
import {
  SEARCH_PROVIDERS,
  providerById,
  type SearchConfig,
  type SearchOptions,
  type SearchProvider,
} from './providers';

export type { SearchHit } from './rank';
export type { SearchConfig } from './providers';

export type ProviderAttempt = {
  provider: string;
  ok: boolean;
  results: number;
  error?: string;
};

export type SearchResponse = {
  query: string;
  provider: string;
  results: SearchHit[];
  attempts: ProviderAttempt[];
  degraded: boolean;
  warning?: string;
  text: string;
};

/** Провайдеры, которые ищут по всему вебу. Остальные — аварийный резерв. */
const WEB_INDEX = new Set([
  'brave',
  'google',
  'serper',
  'tavily',
  'duckduckgo',
  'duckduckgo-lite',
  'mojeek',
  'browser',
]);

const NO_PROVIDER_HINT =
  'Все поисковики отклонили запрос. С серверного IP бесплатный поиск часто блокируется — добавьте ключ в коннекторе Web: Brave Search API (braveApiKey), Google CSE (googleApiKey + googleCx), Serper (serperApiKey) или Tavily (tavilyApiKey).';

const digest = (
  query: string,
  results: SearchHit[],
  warning?: string,
): string =>
  [
    warning ? `Внимание: ${warning}` : '',
    `Результаты поиска: ${query}`,
    ...results.map((item, index) =>
      [
        `${index + 1}. ${item.title}`,
        item.url,
        item.snippet,
        item.text ? item.text.slice(0, 1500) : '',
      ]
        .filter(Boolean)
        .join('\n'),
    ),
  ]
    .filter(Boolean)
    .join('\n\n');

const chooseProviders = (
  config: SearchConfig,
  forced?: string,
): SearchProvider[] => {
  if (forced) {
    const provider = providerById(forced);

    if (!provider) {
      throw new Error(
        `Неизвестный провайдер поиска: ${forced}. Доступны: ${SEARCH_PROVIDERS.map(
          (item) => item.id,
        ).join(', ')}`,
      );
    }

    return [provider];
  }

  return SEARCH_PROVIDERS.filter((provider) => provider.enabled(config));
};

const enrich = async (
  results: SearchHit[],
  count: number,
  maxChars: number,
): Promise<void> => {
  const targets = results.slice(0, count).filter((item) => !item.text);

  await Promise.all(
    targets.map(async (item) => {
      try {
        const page = await fetchPublic(item.url, { timeoutMs: 12_000, retries: 0 });
        const content = readableText(page.body);

        if (content.length > 80) {
          item.text = content.slice(0, maxChars);
        }

        if (!item.snippet) {
          item.snippet = metaDescription(page.body).slice(0, 400);
        }
      } catch {
        // страница недоступна — остаёмся со сниппетом выдачи
      }
    }),
  );
};

export const webSearch = async (options: {
  query: string;
  limit?: number;
  site?: string;
  lang?: string;
  region?: string;
  freshness?: string;
  provider?: string;
  fetchContent?: boolean;
  contentLimit?: number;
  contentChars?: number;
  config?: SearchConfig;
}): Promise<SearchResponse> => {
  const config = options.config ?? {};
  const query = buildQuery({ query: options.query, site: options.site });

  if (!query) {
    throw new Error('Укажите query для web.search');
  }

  const limit = Math.min(Math.max(options.limit || 5, 1), 20);
  const searchOptions: SearchOptions = {
    query,
    limit,
    lang: (options.lang || 'ru').toLowerCase(),
    region: (options.region || 'ru').toLowerCase(),
    freshness: options.freshness,
    timeoutMs: 20_000,
  };

  const attempts: ProviderAttempt[] = [];
  const collected: SearchHit[] = [];
  let winner = '';

  for (const provider of chooseProviders(config, options.provider)) {
    try {
      const found = await provider.run(searchOptions, config);

      attempts.push({ provider: provider.id, ok: true, results: found.length });
      collected.push(...found);

      if (!winner && found.length) {
        winner = provider.id;
      }

      if (rankHits(collected, query, limit).length >= limit) {
        break;
      }
    } catch (error) {
      attempts.push({
        provider: provider.id,
        ok: false,
        results: 0,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const results = rankHits(collected, query, limit);

  if (!results.length) {
    const details = attempts
      .filter((item) => !item.ok)
      .map((item) => `${item.provider}: ${item.error}`)
      .join('; ');

    throw new Error(`${NO_PROVIDER_HINT}${details ? ` Детали — ${details}` : ''}`);
  }

  if (options.fetchContent !== false) {
    await enrich(
      results,
      Math.min(Math.max(options.contentLimit ?? 3, 0), results.length),
      Math.min(Math.max(options.contentChars ?? 4000, 500), 20_000),
    );
  }

  const provider = winner || results[0]?.provider || 'unknown';
  const degraded = !WEB_INDEX.has(provider);
  const warning = degraded
    ? `поисковики по вебу недоступны, выдача собрана резервным источником «${provider}» и может быть неточной. ${NO_PROVIDER_HINT}`
    : undefined;

  return {
    query,
    provider,
    results,
    attempts,
    degraded,
    warning,
    text: digest(query, results, warning),
  };
};

export const webFetch = async (options: {
  url: string;
  maxChars?: number;
  full?: boolean;
}): Promise<{
  url: string;
  title: string;
  description: string;
  contentType: string;
  text: string;
  tables: string[][][];
  json?: unknown;
}> => {
  const maxChars = Math.min(Math.max(options.maxChars || 12_000, 500), 40_000);
  const response = await fetchPublic(options.url);
  const type = response.contentType.toLowerCase();

  if (type.includes('application/json') || type.includes('+json')) {
    const json = JSON.parse(response.body) as unknown;

    return {
      url: response.url,
      title: '',
      description: '',
      contentType: response.contentType,
      text: JSON.stringify(json, null, 2).slice(0, maxChars),
      tables: [],
      json,
    };
  }

  const extracted = options.full
    ? stripHtml(response.body)
    : readableText(response.body);

  return {
    url: response.url,
    title: pageTitle(response.body),
    description: metaDescription(response.body),
    contentType: response.contentType,
    text: extracted.slice(0, maxChars),
    tables: extractTables(response.body),
  };
};
