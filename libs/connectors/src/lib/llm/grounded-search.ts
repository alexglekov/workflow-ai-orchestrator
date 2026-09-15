import { describeQwenError, type LlmProviderId } from './complete';
import { resolveLlm, type ResolvedLlm } from './resolve';
import type { SearchHit } from '../web/rank';

const TIMEOUT_MS = 12_000;

export type GroundedSearch = {
  provider: LlmProviderId;
  text: string;
  results: SearchHit[];
};

const hit = (
  provider: string,
  title: string,
  url: string,
  snippet: string,
  body?: string,
): SearchHit => ({
  provider,
  title: title.slice(0, 200),
  url,
  snippet: snippet.slice(0, 400),
  ...(body ? { text: body.slice(0, 8000) } : {}),
});

const fetchJson = async (url: string, init: RequestInit) => {
  const response = await fetch(url, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(TIMEOUT_MS),
  });
  const body = (await response.json()) as Record<string, unknown>;

  return { response, body };
};

type QwenSearchResult = {
  url?: string;
  title?: string;
  site_name?: string;
  snippet?: string;
};

/** Ссылки лежат по-разному в зависимости от версии compatible-mode. */
const qwenSearchResults = (
  body: Record<string, unknown>,
  choice: Record<string, unknown> | undefined,
): QwenSearchResult[] => {
  const candidates = [
    (body['search_info'] as { search_results?: QwenSearchResult[] })
      ?.search_results,
    (choice?.['search_info'] as { search_results?: QwenSearchResult[] })
      ?.search_results,
    (
      (choice?.['message'] as Record<string, unknown>)?.['search_info'] as {
        search_results?: QwenSearchResult[];
      }
    )?.search_results,
  ];

  return candidates.find((item) => Array.isArray(item) && item.length) ?? [];
};

/** Qwen ищет сам, если включить enable_search. */
const qwenSearch = async (
  llm: ResolvedLlm,
  query: string,
): Promise<GroundedSearch> => {
  const base = llm.baseUrl.replace(/\/+$/, '');
  const prompt = `Найди актуальную информацию в интернете и ответь по существу. Укажи конкретные числа, даты и факты. Не пиши код.\nЗапрос: ${query}`;
  const { response, body } = await fetchJson(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${llm.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: llm.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      enable_search: true,
      search_options: { forced_search: true, enable_source: true },
    }),
  });

  if (!response.ok) {
    throw new Error(
      describeQwenError(
        response.status,
        (body['error'] as { message?: string } | undefined)?.message ||
          (body['message'] as string | undefined),
        (body['error'] as { code?: string } | undefined)?.code ||
          (body['code'] as string | undefined),
      ),
    );
  }

  const choice = (body['choices'] as Array<Record<string, unknown>>)?.[0];
  const text = String(
    (choice?.['message'] as { content?: string } | undefined)?.content || '',
  ).trim();
  const results = qwenSearchResults(body, choice)
    .map((item) =>
      hit(
        'qwen',
        item.title || item.site_name || query,
        item.url || '',
        item.snippet || text.slice(0, 280),
        text,
      ),
    )
    .filter((item) => /^https?:\/\//i.test(item.url));

  if (!text && !results.length) {
    throw new Error('Qwen Search вернул пустой ответ');
  }

  if (!results.length && text) {
    results.push(
      hit(
        'qwen',
        query,
        'https://www.google.com/search?q=' + encodeURIComponent(query),
        text,
        text,
      ),
    );
  }

  return { provider: 'qwen', text, results };
};

export const groundedWebSearch = async (
  query: string,
  llm: ResolvedLlm = resolveLlm(),
): Promise<GroundedSearch> => {
  if (!llm.apiKey) {
    throw new Error('Нет QWEN_API_KEY для поиска модели');
  }

  return qwenSearch(llm, query);
};
