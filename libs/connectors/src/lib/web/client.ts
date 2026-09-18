import { searchFreshness, shapeSearchQuery } from './query';
import { rankHits } from './rank';
import type { SearchHit } from './rank';
import { composeSearchText, extractiveAnswer } from './answer';
import {
  providerById,
  type SearchConfig,
  type SearchOptions,
  type SearchProvider,
} from './providers';
import { completeLlm } from '../llm/complete';
import { resolveLlm } from '../llm/resolve';
import { readPage, tavilyExtract } from './extract';

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
  answer: string;
  text: string;
};

/** Поиск идёт только через Tavily. */
const WEB_INDEX = new Set(['tavily']);

/** Поисковики быстро включают 429, поэтому одинаковые запросы не повторяем. */
const CACHE_TTL_MS = 5 * 60_000;
const cache = new Map<string, { at: number; response: SearchResponse }>();

const cached = (key: string): SearchResponse | undefined => {
  const found = cache.get(key);

  if (!found) {
    return undefined;
  }

  if (Date.now() - found.at > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }

  return found.response;
};

const remember = (key: string, response: SearchResponse): void => {
  if (cache.size > 100) {
    cache.clear();
  }

  cache.set(key, { at: Date.now(), response });
};

const NO_PROVIDER_HINT =
  'Tavily не ответил. Проверьте TAVILY_API_KEY в .env или в карточке коннектора Web.';

const chooseProviders = (config: SearchConfig): SearchProvider[] => {
  const provider = providerById('tavily');

  if (!provider) {
    throw new Error('Провайдер Tavily не найден');
  }

  if (!config.tavilyKey) {
    throw new Error(
      'Для поиска в интернете нужен TAVILY_API_KEY. Добавьте ключ в .env или в карточке коннектора Web.',
    );
  }

  return [provider];
};

const enrich = async (
  results: SearchHit[],
  count: number,
  maxChars: number,
  tavilyKey?: string,
): Promise<void> => {
  const targets = results.slice(0, count).filter((item) => item.url);
  const urls = targets.map((item) => item.url);

  if (!urls.length) {
    return;
  }

  let extracted = new Map<string, string>();

  if (tavilyKey) {
    try {
      extracted = await tavilyExtract(urls, tavilyKey);
    } catch {
      extracted = new Map();
    }
  }

  for (const item of targets) {
    const content =
      extracted.get(item.url) ||
      [...extracted.entries()].find(([url]) => url.includes(item.url) || item.url.includes(url))?.[1] ||
      '';

    if (content.length > 80) {
      item.text = content.slice(0, maxChars);
    }
  }
};

const groundedAnswer = (results: SearchHit[]): string => {
  const featured = results.find(
    (item) => item.featured && (item.text || '').trim().length > 20,
  );

  if (featured?.text) {
    return featured.text.trim();
  }

  const fromLlm = results.find(
    (item) =>
      (item.provider === 'llm' || item.provider === 'qwen') &&
      (item.text || '').trim().length > 40,
  );

  return (fromLlm?.text || '').trim();
};

/** Если модель не ответила, не ждём её на каждом следующем поиске. */
let llmUnavailableUntil = 0;

const synthesizeAnswer = async (
  query: string,
  results: SearchHit[],
  config: SearchConfig,
): Promise<string> => {
  const llm = config.llm ?? resolveLlm();

  if (!llm.apiKey || Date.now() < llmUnavailableUntil) {
    return '';
  }

  const sources = results
    .slice(0, 6)
    .map((item, index) =>
      [
        `${index + 1}. ${item.title}`,
        item.url,
        item.snippet,
        (item.text || '').slice(0, 900),
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n');

  try {
    return (
      await completeLlm({
        ...llm,
        timeoutMs: 20_000,
        temperature: 0.15,
        messages: [
          {
            role: 'system',
            content: [
              'Ты как сниппет Google: сразу ответь на вопрос человека.',
              'Факты, числа, даты, единицы. 2–6 коротких предложений.',
              'Не копируй шапки Wikipedia и меню сайтов. Не пиши код.',
              'Если данные расходятся — скажи об этом и укажи источники.',
            ].join(' '),
          },
          {
            role: 'user',
            content: `Вопрос: ${query}\n\nРезультаты поиска:\n${sources}`,
          },
        ],
      })
    ).trim();
  } catch {
    llmUnavailableUntil = Date.now() + 5 * 60_000;

    return '';
  }
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
  const site = (options.site || '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/^www\./i, '');
  const query = shapeSearchQuery(options.query);
  const freshness = options.freshness || searchFreshness(query);

  if (!query) {
    throw new Error('Укажите query для web.search');
  }

  const limit = Math.min(Math.max(options.limit || 5, 1), 20);
  const searchOptions: SearchOptions = {
    query,
    limit,
    lang: (options.lang || 'ru').toLowerCase(),
    region: (options.region || 'ru').toLowerCase(),
    freshness,
    timeoutMs: 30_000,
    site: site || undefined,
  };
  const cacheKey = JSON.stringify([
    query,
    site,
    limit,
    searchOptions.lang,
    searchOptions.region,
    searchOptions.freshness,
  ]);
  const hit = cached(cacheKey);

  if (hit) {
    return hit;
  }

  const runProviders = async (opts: SearchOptions) => {
    const attempts: ProviderAttempt[] = [];
    const collected: SearchHit[] = [];
    let winner = '';

    for (const provider of chooseProviders(config)) {
      try {
        const found = await provider.run(opts, config);

        attempts.push({
          provider: provider.id,
          ok: true,
          results: found.length,
        });
        collected.push(...found);

        if (!winner && found.length) {
          winner = provider.id;
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

    return { attempts, collected, winner };
  };

  let { attempts, collected, winner } = await runProviders(searchOptions);
  let results = rankHits(collected, query, limit, 2, site);

  if (!results.length && site) {
    const withoutSite = await runProviders({
      ...searchOptions,
      site: undefined,
    });

    attempts = [...attempts, ...withoutSite.attempts];
    collected = withoutSite.collected;
    winner = withoutSite.winner;
    results = rankHits(collected, query, limit, 2, site);
  }

  if (!results.length && searchOptions.freshness === 'day') {
    const weekly = await runProviders({
      ...searchOptions,
      site: undefined,
      freshness: 'week',
    });

    attempts = [...attempts, ...weekly.attempts];
    collected = weekly.collected;
    winner = weekly.winner;
    results = rankHits(collected, query, limit, 2, site);
  }

  if (!results.length && searchOptions.freshness) {
    const relaxed = await runProviders({
      ...searchOptions,
      site: undefined,
      freshness: undefined,
    });

    attempts = [...attempts, ...relaxed.attempts];
    collected = relaxed.collected;
    winner = relaxed.winner;
    results = rankHits(collected, query, limit, 2, site);
  }

  if (!results.length) {
    const details = attempts
      .filter((item) => !item.ok)
      .map((item) => `${item.provider}: ${item.error}`)
      .join('; ');
    const warning = details
      ? `${NO_PROVIDER_HINT} ${details}`
      : `по запросу «${query}» ничего не нашлось`;
    const text = details
      ? `Не удалось найти в интернете. ${details}`
      : `Ничего не нашлось по запросу «${query}».`;

    return {
      query,
      provider: attempts.find((item) => item.ok)?.provider || 'tavily',
      results: [],
      attempts,
      degraded: true,
      warning,
      answer: '',
      text,
    };
  }

  if (options.fetchContent) {
    await enrich(
      results,
      Math.min(Math.max(options.contentLimit ?? 3, 0), results.length),
      Math.min(Math.max(options.contentChars ?? 1800, 500), 8_000),
      config.tavilyKey,
    );
  }

  const provider = winner || results[0]?.provider || 'unknown';
  const degraded = !WEB_INDEX.has(provider);
  const warning = degraded
    ? `поисковики по вебу недоступны, выдача собрана резервным источником «${provider}» и может быть неточной. ${NO_PROVIDER_HINT}`
    : undefined;

  const answer =
    groundedAnswer(results) ||
    (await synthesizeAnswer(query, results, config)) ||
    extractiveAnswer(results);
  const text = composeSearchText(query, results, { answer, warning });
  const response: SearchResponse = {
    query,
    provider,
    results,
    attempts,
    degraded,
    warning,
    answer,
    text,
  };

  remember(cacheKey, response);

  return response;
};

export const webFetch = async (options: {
  url: string;
  maxChars?: number;
  full?: boolean;
  tavilyKey?: string;
  country?: string;
}): Promise<{
  url: string;
  title: string;
  description: string;
  contentType: string;
  text: string;
  tables: string[][][];
  json?: unknown;
  rendered?: boolean;
  source?: string;
}> => readPage(options);
