import { queryTerms } from './query';

export type SearchHit = {
  title: string;
  url: string;
  snippet: string;
  host?: string;
  provider?: string;
  score?: number;
  text?: string;
};

const TRACKING = /^(utm_|yclid|gclid|fbclid|_openstat|from|ref|referrer)/i;

const JUNK_URL =
  /(duckduckgo\.com\/y\.js|bing\.com\/ck\/|\/aclk\?|googleadservices|doubleclick\.net|adservice\.google|bing\.com\/aclick|\.(?:jpg|jpeg|png|gif|svg|ico|css|js|woff2?)(?:$|\?))/i;

export const canonicalUrl = (raw: string): string => {
  try {
    const parsed = new URL(raw);

    for (const key of [...parsed.searchParams.keys()]) {
      if (TRACKING.test(key)) {
        parsed.searchParams.delete(key);
      }
    }

    parsed.hash = '';
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, '');

    if (parsed.pathname !== '/' && parsed.pathname.endsWith('/')) {
      parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    }

    return parsed.toString();
  } catch {
    return raw.trim();
  }
};

export const hostOf = (raw: string): string => {
  try {
    return new URL(raw).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
};

export const isUsableUrl = (raw: string): boolean => {
  if (!/^https?:\/\//i.test(raw) || JUNK_URL.test(raw)) {
    return false;
  }

  return Boolean(hostOf(raw));
};

const overlap = (terms: string[], text: string): number => {
  if (!terms.length || !text) {
    return 0;
  }

  const lower = text.toLowerCase();
  const matched = terms.filter((term) => lower.includes(term)).length;

  return matched / terms.length;
};

/**
 * Дедуплицирует выдачу разных провайдеров, выбрасывает рекламу и мусор,
 * сортирует по совпадению с запросом, не давая одному домену занять всю выдачу.
 */
export const rankHits = (
  hits: SearchHit[],
  query: string,
  limit: number,
  maxPerHost = 2,
): SearchHit[] => {
  const terms = queryTerms(query);
  const seen = new Map<string, SearchHit>();

  hits.forEach((hit, index) => {
    const url = canonicalUrl(hit.url || '');

    if (!isUsableUrl(url) || !hit.title.trim()) {
      return;
    }

    const host = hostOf(url);
    const wiki =
      /(?:^|\.)wikipedia\.org$/.test(host) || /(?:^|\.)wikiwand\.com$/.test(host);
    const wantsWiki = /\bwiki/i.test(query);
    const score =
      overlap(terms, hit.title) * 3 +
      overlap(terms, hit.snippet) * 1.5 +
      overlap(terms, host.replace(/[.-]/g, ' ')) * 1.5 +
      (hit.snippet.trim() ? 0.4 : 0) +
      Math.max(0, 1 - index / 40) +
      (wiki && !wantsWiki ? -2 : 0);
    const existing = seen.get(url);

    if (existing) {
      existing.snippet = existing.snippet || hit.snippet;
      existing.score = Math.max(existing.score ?? 0, score);
      return;
    }

    seen.set(url, { ...hit, url, host, score });
  });

  const sorted = [...seen.values()].sort(
    (left, right) => (right.score ?? 0) - (left.score ?? 0),
  );
  const perHost = new Map<string, number>();
  const primary: SearchHit[] = [];
  const overflow: SearchHit[] = [];

  for (const hit of sorted) {
    const host = hit.host || '';
    const used = perHost.get(host) ?? 0;

    if (used < maxPerHost) {
      perHost.set(host, used + 1);
      primary.push(hit);
    } else {
      overflow.push(hit);
    }
  }

  return [...primary, ...overflow].slice(0, limit);
};
