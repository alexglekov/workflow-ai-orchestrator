import { extractTables, pageTitle, stripHtml } from './html';
import { fetchPublic } from './fetch-public';
import { USER_AGENT } from './ssrf';

export type SearchHit = {
  title: string;
  url: string;
  snippet: string;
};

const decodeDdg = (href: string): string => {
  try {
    const parsed = new URL(href, 'https://duckduckgo.com');
    const uddg = parsed.searchParams.get('uddg');

    return uddg ? decodeURIComponent(uddg) : parsed.toString();
  } catch {
    return href;
  }
};

const searchDuckDuckGo = async (
  query: string,
  limit: number,
): Promise<SearchHit[]> => {
  const response = await fetchPublic('https://html.duckduckgo.com/html/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    body: `q=${encodeURIComponent(query)}`,
  });

  const blocks = [
    ...response.body.matchAll(
      /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi,
    ),
  ];
  const snippets = [
    ...response.body.matchAll(
      /class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|td|div)>/gi,
    ),
  ];

  return blocks.slice(0, limit).map((match, index) => ({
    title: stripHtml(match[2]).slice(0, 180),
    url: decodeDdg(match[1].replace(/&amp;/g, '&')),
    snippet: snippets[index] ? stripHtml(snippets[index][1]).slice(0, 280) : '',
  }));
};

const searchBrave = async (
  query: string,
  limit: number,
  token: string,
): Promise<SearchHit[]> => {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`;
  const response = await fetchPublic(url, {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': token,
    },
  });
  const parsed = JSON.parse(response.body) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> };
  };

  return (parsed.web?.results ?? [])
    .slice(0, limit)
    .map((item) => ({
      title: String(item.title || '').slice(0, 180),
      url: String(item.url || ''),
      snippet: String(item.description || '').slice(0, 280),
    }))
    .filter((item) => item.url);
};

export const webSearch = async (options: {
  query: string;
  limit: number;
  braveKey?: string;
}): Promise<{ query: string; provider: string; results: SearchHit[] }> => {
  const query = options.query.trim();
  const limit = Math.min(Math.max(options.limit || 5, 1), 10);

  if (!query) {
    throw new Error('Укажите query');
  }

  if (options.braveKey) {
    return {
      query,
      provider: 'brave',
      results: await searchBrave(query, limit, options.braveKey),
    };
  }

  return {
    query,
    provider: 'duckduckgo',
    results: await searchDuckDuckGo(query, limit),
  };
};

export const webFetch = async (options: {
  url: string;
  maxChars?: number;
}): Promise<{
  url: string;
  title: string;
  contentType: string;
  text: string;
  tables: string[][][];
  json?: unknown;
}> => {
  const maxChars = Math.min(Math.max(options.maxChars || 12_000, 500), 40_000);
  const response = await fetchPublic(options.url);
  const type = response.contentType.toLowerCase();

  if (type.includes('application/json')) {
    const json = JSON.parse(response.body) as unknown;

    return {
      url: response.url,
      title: '',
      contentType: response.contentType,
      text: JSON.stringify(json, null, 2).slice(0, maxChars),
      tables: [],
      json,
    };
  }

  const text = stripHtml(response.body).slice(0, maxChars);

  return {
    url: response.url,
    title: pageTitle(response.body),
    contentType: response.contentType,
    text,
    tables: extractTables(response.body),
  };
};
