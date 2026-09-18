import { hostOf } from './rank';

export type NamedSite = {
  host: string;
  token: string;
};

const ALIASES: Array<{ names: string[]; host: string }> = [
  { names: ['bestchange'], host: 'bestchange.ru' },
  { names: ['binance', 'бинанс'], host: 'binance.com' },
  { names: ['bybit', 'байбит'], host: 'bybit.com' },
  { names: ['okx', 'окх'], host: 'okx.com' },
  { names: ['coinbase'], host: 'coinbase.com' },
  { names: ['kraken'], host: 'kraken.com' },
  { names: ['kucoin'], host: 'kucoin.com' },
  { names: ['huobi'], host: 'huobi.com' },
  { names: ['mexc'], host: 'mexc.com' },
  { names: ['wikipedia', 'википедия'], host: 'wikipedia.org' },
];

const HOST =
  /\b(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|ru|io|net|org|co|info|me))\b/i;

const AFTER_VISIT =
  /(?:зайди(?:те)?\s+на|открой(?:те)?(?:\s+(?:сайт|страницу))?|на сайте|с сайта|сайт)\s+([a-zа-яё0-9._-]{3,})/iu;

const levenshtein = (left: string, right: string): number => {
  if (left === right) {
    return 0;
  }

  const rows = left.length + 1;
  const cols = right.length + 1;
  const grid = new Array<number>(rows * cols).fill(0);

  for (let index = 0; index < rows; index += 1) {
    grid[index * cols] = index;
  }

  for (let index = 0; index < cols; index += 1) {
    grid[index] = index;
  }

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      grid[i * cols + j] = Math.min(
        grid[(i - 1) * cols + j] + 1,
        grid[i * cols + j - 1] + 1,
        grid[(i - 1) * cols + j - 1] + cost,
      );
    }
  }

  return grid[left.length * cols + right.length];
};

const compact = (value: string): string =>
  value.toLowerCase().replace(/[^a-zа-яё0-9]/gi, '');

const matchAlias = (token: string): string | null => {
  const needle = compact(token);

  if (needle.length < 3) {
    return null;
  }

  for (const alias of ALIASES) {
    for (const name of alias.names) {
      const target = compact(name);

      if (needle === target) {
        return alias.host;
      }

      if (
        target.length >= 8 &&
        needle.startsWith(target.slice(0, 4)) &&
        levenshtein(needle, target) <= 2
      ) {
        return alias.host;
      }
    }
  }

  return null;
};

/** Сайт из формулировки: домен, «зайди на X», опечатки вроде bestchnage. */
export const namedSite = (text: string): NamedSite | null => {
  const hostMatch = text.match(HOST);

  if (hostMatch?.[1]) {
    const host = hostMatch[1].toLowerCase().replace(/^www\./, '');

    return { host, token: host.split('.')[0] };
  }

  const visit = text.match(AFTER_VISIT)?.[1];

  if (visit) {
    const aliased = matchAlias(visit);

    if (aliased) {
      return { host: aliased, token: compact(visit) };
    }

    if (HOST.test(visit)) {
      const host = visit.toLowerCase().replace(/^www\./, '');

      return { host, token: host.split('.')[0] };
    }

    return { host: '', token: compact(visit) };
  }

  for (const alias of ALIASES) {
    for (const name of alias.names) {
      if (matchAlias(name) && new RegExp(name, 'i').test(text)) {
        return { host: alias.host, token: name };
      }
    }
  }

  const tokens = text.toLowerCase().match(/[a-z]{8,14}/g) ?? [];

  for (const token of tokens) {
    const host = matchAlias(token);

    if (host) {
      return { host, token };
    }
  }

  return null;
};

export const hostMatchesSite = (url: string, site?: string): boolean => {
  if (!site) {
    return false;
  }

  const host = hostOf(url);
  const needle = site.toLowerCase().replace(/^www\./, '');

  if (!host || !needle) {
    return false;
  }

  return (
    host === needle ||
    host.endsWith(`.${needle}`) ||
    host.includes(needle.split('.')[0])
  );
};

const p2pPathScore = (url: string): number => {
  try {
    const path = new URL(url).pathname.toLowerCase();

    if (/\/(otc|p2p|fiat\/trade)\b/.test(path)) {
      return 3;
    }

    if (/\/convert\b/.test(path) || path === '/' || /^\/(en|ru|cn)\/?$/.test(path)) {
      return 0;
    }

    return 1;
  } catch {
    return 0;
  }
};

/** URL страницы, которую стоит открыть после поиска: сначала стакан P2P, затем названный сайт. */
export const pickResultUrl = (
  results: unknown,
  site?: string,
): string => {
  if (!Array.isArray(results)) {
    return '';
  }

  const urls = results
    .map((item) =>
      item && typeof item === 'object'
        ? String((item as Record<string, unknown>)['url'] || '').trim()
        : '',
    )
    .filter((url) => /^https?:\/\//i.test(url));

  const ranked = [...urls].sort((left, right) => {
    const siteBoost = (url: string) => (site && hostMatchesSite(url, site) ? 10 : 0);

    return siteBoost(right) + p2pPathScore(right) - (siteBoost(left) + p2pPathScore(left));
  });

  return ranked[0] || '';
};

export const wantsPageVisit = (text: string): boolean =>
  /зайди|открой(?:те)?\s+(?:сайт|страницу)|на сайте|с сайта|(?<![\p{L}])парс(?:ить|инг)?(?![\p{L}])/iu.test(
    text,
  );

const P2P_PAIR =
  /\b(usdt|btc|eth|ton|usdc)(?:\s*[/_-]\s*|\s+)(eur|usd|rub|uah|kzt|try|brl)\b/i;

export type P2pBrand = 'bybit' | 'binance' | 'okx';

export type P2pTarget = {
  brand: P2pBrand;
  token: string;
  fiat: string;
  /** buy — пользователь покупает крипту, sell — продаёт. */
  side: 'buy' | 'sell';
};

const p2pBrand = (prompt: string): P2pBrand | '' => {
  const host = namedSite(prompt)?.host || '';

  if (host === 'bybit.com' || /bybit|байбит/i.test(prompt)) {
    return 'bybit';
  }

  if (host === 'binance.com' || /binance|бинанс/i.test(prompt)) {
    return 'binance';
  }

  if (host === 'okx.com' || /(?<![\p{L}])okx(?![\p{L}])|окх/iu.test(prompt)) {
    return 'okx';
  }

  return '';
};

/** Биржа, пара и сторона сделки из формулировки P2P-задачи. */
export const p2pTarget = (prompt: string): P2pTarget | null => {
  if (!/p2p|п2п/i.test(prompt)) {
    return null;
  }

  const pair = prompt.match(P2P_PAIR);
  const brand = p2pBrand(prompt);

  if (!pair || !brand) {
    return null;
  }

  const side: 'buy' | 'sell' = /продат|продаж|sell/i.test(prompt)
    ? 'sell'
    : 'buy';

  return {
    brand,
    token: pair[1].toUpperCase(),
    fiat: pair[2].toUpperCase(),
    side,
  };
};

/** Прямой URL стакана P2P, если биржа и пара названы в задаче. */
export const p2pPageUrl = (prompt: string): string => {
  const target = p2pTarget(prompt);

  if (!target) {
    return '';
  }

  const { brand, token, fiat, side } = target;

  if (brand === 'bybit') {
    return `https://www.bybit.com/en/fiat/trade/otc/${side}/${token}/${fiat}`;
  }

  if (brand === 'binance') {
    return `https://p2p.binance.com/en/trade/all-payments/${token}?fiat=${fiat}`;
  }

  return `https://www.okx.com/p2p-markets/${fiat.toLowerCase()}/${side}-${token.toLowerCase()}`;
};

/** Короткая фраза для поиска стакана, без даты и «найди в чат». */
export const p2pSearchQuery = (prompt: string): string => {
  const target = p2pTarget(prompt);

  if (!target) {
    return '';
  }

  return `${target.brand} p2p ${target.side} ${target.token} ${target.fiat} otc`;
};

const CRYPTO_SLUG: Record<string, string> = {
  btc: 'bitcoin',
  bitcoin: 'bitcoin',
  eth: 'ethereum',
  ltc: 'litecoin',
  usdt: 'tether-trc20',
  tether: 'tether-trc20',
  usdc: 'usd-coin',
  ton: 'toncoin',
  xrp: 'ripple',
  sol: 'solana',
  trx: 'tron',
  bnb: 'binance-coin',
};

const RATE_PAIR =
  /\b(usdt|tether|btc|bitcoin|eth|ltc|usdc|ton|xrp|sol|trx|bnb)(?:\s*[/_-]\s*|\s+(?:на|в|to|→)\s+)(usdt|tether|btc|bitcoin|eth|ltc|usdc|ton|xrp|sol|trx|bnb|rub|rur)\b/i;

export type ExchangePair = { from: string; to: string };

export const exchangePair = (prompt: string): ExchangePair | null => {
  const match = prompt.match(RATE_PAIR);

  if (!match) {
    return null;
  }

  const from = match[1].toLowerCase() === 'tether' ? 'usdt' : match[1].toLowerCase();
  const to = match[2].toLowerCase() === 'tether' ? 'usdt' : match[2].toLowerCase();

  if (from === to) {
    return null;
  }

  return { from: from.toUpperCase(), to: to.toUpperCase() };
};

/** Прямой URL монитора BestChange по паре из запроса. */
export const bestchangePageUrl = (prompt: string): string => {
  const host = namedSite(prompt)?.host;
  const mentions =
    host === 'bestchange.ru' || /bestchange|bestchnage/i.test(prompt);

  if (!mentions) {
    return '';
  }

  const pair = exchangePair(prompt);
  const from = CRYPTO_SLUG[(pair?.from || 'usdt').toLowerCase()];
  const to = CRYPTO_SLUG[(pair?.to || 'btc').toLowerCase()];

  if (!from || !to || from === to) {
    return 'https://www.bestchange.ru/';
  }

  return `https://www.bestchange.ru/${from}-to-${to}.html`;
};
