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
import { composeSearchText, extractiveAnswer } from './answer';
import { looksRelevant } from './relevance';
import {
  SEARCH_PROVIDERS,
  providerById,
  type SearchConfig,
  type SearchOptions,
  type SearchProvider,
} from './providers';
import { completeLlm } from '../llm/complete';
import { resolveLlm } from '../llm/resolve';

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

/** Провайдеры, которые ищут по всему вебу. Остальные — аварийный резерв. */
const WEB_INDEX = new Set([
  'llm',
  'gemini',
  'qwen',
  'brave',
  'brave-html',
  'google',
  'serper',
  'tavily',
  'bing',
  'duckduckgo',
  'duckduckgo-lite',
  'mojeek',
  'browser',
]);

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
  'Все поисковики отклонили запрос. Попробуйте ещё раз или добавьте ключ в коннекторе Web: Brave / Google CSE / Serper / Tavily. Бесплатный Bing обычно работает без ключа.';

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
        const page = await fetchPublic(item.url, { timeoutMs: 8_000, retries: 0 });
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

const groundedAnswer = (results: SearchHit[]): string => {
  const fromLlm = results.find(
    (item) =>
      (item.provider === 'llm' ||
        item.provider === 'gemini' ||
        item.provider === 'qwen') &&
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
    timeoutMs: 12_000,
  };
  const cacheKey = JSON.stringify([
    query,
    limit,
    searchOptions.lang,
    searchOptions.region,
    searchOptions.freshness,
    options.provider,
  ]);
  const hit = cached(cacheKey);

  if (hit) {
    return hit;
  }

  const attempts: ProviderAttempt[] = [];
  const collected: SearchHit[] = [];
  let winner = '';

  const forced = Boolean(options.provider);

  for (const provider of chooseProviders(config, options.provider)) {
    try {
      const found = await provider.run(searchOptions, config);

      if (!forced && !looksRelevant(found, query)) {
        throw new Error(
          `${provider.id}: выдача не относится к запросу, источник подменил результаты`,
        );
      }

      attempts.push({ provider: provider.id, ok: true, results: found.length });
      collected.push(...found);

      if (!winner && found.length) {
        winner = provider.id;
      }

      const ranked = rankHits(collected, query, limit);

      if (provider.id === 'llm' && found.length) {
        break;
      }

      if (WEB_INDEX.has(provider.id) && ranked.length >= Math.min(limit, 4)) {
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

  if (options.fetchContent !== false && winner !== 'llm') {
    await enrich(
      results,
      Math.min(Math.max(options.contentLimit ?? 3, 0), results.length),
      Math.min(Math.max(options.contentChars ?? 1800, 500), 8_000),
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
