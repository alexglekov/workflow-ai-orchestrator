import { USER_AGENT } from './ssrf';
import { zipRead } from './zip';

const SOURCES = [
  'https://api.bestchange.ru/info.zip',
  'http://api.bestchange.ru/info.zip',
];

const TICKERS =
  'btc|eth|ltc|sol|xrp|bnb|usdt|usdc|trx|ton|doge|xmr|dash|bch|rub|rur|uah|kzt';

export type RateQuote = {
  from: string;
  to: string;
  fromId: number;
  toId: number;
  rate: number;
};

export type RateOffer = {
  exchanger: string;
  exchangerId: number;
  from: string;
  to: string;
  fromName: string;
  toName: string;
  rate: number;
  reserve: number | null;
};

export type BestChangeRates = {
  btcRub: number | null;
  ltcRub: number | null;
  usdtRub: number | null;
  pair: string | null;
  from: string | null;
  to: string | null;
  quotes: RateQuote[];
  offers: RateOffer[];
  text: string;
  source: string;
};

type NamedId = { id: number; name: string; score: number };

const decodeCy = (buffer: Buffer): string => {
  try {
    return new TextDecoder('windows-1251').decode(buffer);
  } catch {
    return buffer.toString('latin1');
  }
};

const splitRows = (text: string): string[] =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const parseNamed = (
  text: string,
  nameIndex: number,
): Array<{ id: number; name: string }> =>
  splitRows(text)
    .map((line) => {
      const parts = line.split(';');
      const id = Number(parts[0]);
      const name = (parts[nameIndex] || parts[1] || '').trim();

      return { id, name };
    })
    .filter((item) => Number.isFinite(item.id) && item.name);

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
      const offset = i * cols + j;
      grid[offset] = Math.min(
        grid[(i - 1) * cols + j] + 1,
        grid[i * cols + j - 1] + 1,
        grid[(i - 1) * cols + j - 1] + cost,
      );
    }
  }

  return grid[rows * cols - 1];
};

/** BestChange, including typos like bestchnage / бестчендж. */
export const mentionsBestChange = (text: string): boolean => {
  if (/бестч[её]ндж/i.test(text) || /best[\s._-]*ch[ae]nge/i.test(text)) {
    return true;
  }

  const tokens = text.toLowerCase().match(/[a-z]{8,14}/g) ?? [];

  return tokens.some(
    (token) =>
      token.startsWith('bestch') && levenshtein(token, 'bestchange') <= 2,
  );
};

export const parseRatePair = (
  text: string,
): { from: string; to: string } | null => {
  const match = text.match(
    new RegExp(
      `\\b(${TICKERS})\\s*(?:\\/|->|→|-|в|на)\\s*(${TICKERS})\\b`,
      'i',
    ),
  );

  if (!match?.[1] || !match[2]) {
    return null;
  }

  return {
    from: match[1].toUpperCase().replace(/^RUR$/, 'RUB'),
    to: match[2].toUpperCase().replace(/^RUR$/, 'RUB'),
  };
};

export const parseOfferLimit = (
  text: string,
  pair?: { from: string; to: string } | null,
): number => {
  const match = text.match(
    /топ(?:[-\s]*а)?\s*(\d{1,2})|лучш(?:ие|их)\s+(\d{1,2})|(\d{1,2})\s+(?:лучш|предложен)/i,
  );
  const raw = Number(match?.[1] || match?.[2] || match?.[3] || 0);

  if (raw > 0) {
    return Math.min(20, raw);
  }

  if (pair || /топ|предложен|оферт/i.test(text)) {
    return 10;
  }

  return 0;
};

const isBtc = (name: string) =>
  /\bBTC\b/i.test(name) &&
  !/LN|BEP20|CASH|Lightning/i.test(name) &&
  /Bitcoin|BTC/i.test(name);

const isLtc = (name: string) =>
  /\bLTC\b/i.test(name) || /Litecoin/i.test(name);

const isUsdt = (name: string) =>
  /USDT.*TRC20|TRC20.*USDT|Tether TRC20/i.test(name) ||
  (/USDT/i.test(name) && /TRC20/i.test(name));

const isUsdtFallback = (name: string) =>
  /\bUSDT\b/i.test(name) && !/BEP20|SOL|TON|AVAX/i.test(name);

const isRubRail = (name: string) =>
  /Тинькофф|Tinkoff|TJS?BRUB|СБП|SBP|Сбер|Sberbank|Сбербанк/i.test(name) &&
  /RUB|руб|RUR/i.test(name);

const isRubFallback = (name: string) =>
  /(Tinkoff|Тинькофф|СБП|SBP)/i.test(name);

const tickerScore = (name: string, ticker: string): number => {
  const code = ticker.toUpperCase();

  if (code === 'BTC') {
    return isBtc(name) ? 4 : 0;
  }

  if (code === 'LTC') {
    return isLtc(name) ? 4 : 0;
  }

  if (code === 'USDT') {
    if (isUsdt(name)) {
      return 5;
    }

    return isUsdtFallback(name) ? 2 : 0;
  }

  if (code === 'RUB' || code === 'RUR') {
    if (isRubRail(name)) {
      return 5;
    }

    if (isRubFallback(name)) {
      return 3;
    }

    return /RUB|руб|RUR/i.test(name) ? 1 : 0;
  }

  const token = new RegExp(`(?:^|[^A-Z0-9])${code}(?:[^A-Z0-9]|$)`, 'i');

  if (!token.test(name) && !name.toUpperCase().includes(code)) {
    return 0;
  }

  if (/CASH|наличн/i.test(name)) {
    return 1;
  }

  return 3;
};

const rankedCurrencies = (
  items: Array<{ id: number; name: string }>,
  ticker: string,
): NamedId[] =>
  items
    .map((item) => ({ ...item, score: tickerScore(item.name, ticker) }))
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);

const bestRate = (
  rows: string[],
  fromId: number,
  toIds: number[],
): number | null => {
  const targets = new Set(toIds);
  let best: number | null = null;

  for (const line of rows) {
    const parts = line.split(';');
    const from = Number(parts[0]);
    const to = Number(parts[1]);
    const give = Number(parts[3]);
    const get = Number(parts[4]);

    if (from !== fromId || !targets.has(to) || !give || !Number.isFinite(get)) {
      continue;
    }

    const rate = get / give;

    if (!Number.isFinite(rate) || rate <= 0) {
      continue;
    }

    if (best == null || rate > best) {
      best = rate;
    }
  }

  return best;
};

const collectOffers = (
  rows: string[],
  from: NamedId,
  to: NamedId,
  exchangers: Map<number, string>,
  limit: number,
): RateOffer[] => {
  const found: RateOffer[] = [];

  for (const line of rows) {
    const parts = line.split(';');
    const fromId = Number(parts[0]);
    const toId = Number(parts[1]);
    const exchangerId = Number(parts[2]);
    const give = Number(parts[3]);
    const get = Number(parts[4]);
    const reserve = Number(parts[5]);

    if (
      fromId !== from.id ||
      toId !== to.id ||
      !give ||
      !Number.isFinite(get) ||
      get <= 0
    ) {
      continue;
    }

    const rate = get / give;

    if (!Number.isFinite(rate) || rate <= 0) {
      continue;
    }

    found.push({
      exchanger: exchangers.get(exchangerId) || `ID ${exchangerId}`,
      exchangerId,
      from: '',
      to: '',
      fromName: from.name,
      toName: to.name,
      rate,
      reserve: Number.isFinite(reserve) ? reserve : null,
    });
  }

  found.sort((left, right) => right.rate - left.rate);

  const unique: RateOffer[] = [];
  const seen = new Set<number>();

  for (const offer of found) {
    if (seen.has(offer.exchangerId)) {
      continue;
    }

    seen.add(offer.exchangerId);
    unique.push(offer);

    if (unique.length >= limit) {
      break;
    }
  }

  return unique;
};

const downloadZip = async (): Promise<Buffer> => {
  let lastError: Error | null = null;

  for (const url of SOURCES) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/zip,*/*' },
        signal: AbortSignal.timeout(12_000),
        redirect: 'follow',
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${url}`);
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      if (buffer.length > 12_000_000) {
        throw new Error('Архив BestChange слишком большой');
      }

      return buffer;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError || new Error('Не удалось скачать api.bestchange.ru/info.zip');
};

const roundRate = (value: number): number =>
  value >= 100
    ? Math.round(value * 100) / 100
    : Math.round(value * 1_000_000) / 1_000_000;

const formatOfferRate = (value: number): string => {
  if (value >= 100) {
    return value.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  }

  if (value >= 1) {
    return value.toLocaleString('ru-RU', { maximumFractionDigits: 4 });
  }

  return value.toLocaleString('ru-RU', { maximumFractionDigits: 8 });
};

export const parseBestChangeData = (
  files: { cy: string; rates: string; exch?: string },
  options?: { from?: string; to?: string; limit?: number },
): BestChangeRates => {
  const currencies = parseNamed(files.cy, 2);
  const exchangers = new Map(
    parseNamed(files.exch || '', 1).map((item) => [item.id, item.name]),
  );
  const rows = splitRows(files.rates);
  const pairFrom = options?.from?.trim().toUpperCase() || '';
  const pairTo = options?.to?.trim().toUpperCase() || '';
  const pair = pairFrom && pairTo ? { from: pairFrom, to: pairTo } : null;
  const limit = Math.min(20, Math.max(0, Number(options?.limit || 0)));

  const snapshotCurrencies = {
    btc: rankedCurrencies(currencies, 'BTC')[0] ?? null,
    ltc: rankedCurrencies(currencies, 'LTC')[0] ?? null,
    usdt: rankedCurrencies(currencies, 'USDT')[0] ?? null,
  };
  const rubIds = rankedCurrencies(currencies, 'RUB').map((item) => item.id);
  const quotes: RateQuote[] = [];

  const addSnapshot = (
    from: NamedId | null,
    key: string,
  ): number | null => {
    if (!from || rubIds.length === 0) {
      return null;
    }

    const rate = bestRate(rows, from.id, rubIds);

    if (rate == null) {
      return null;
    }

    quotes.push({
      from: key,
      to: 'RUB',
      fromId: from.id,
      toId: rubIds[0],
      rate: roundRate(rate),
    });

    return roundRate(rate);
  };

  const btcRub = addSnapshot(snapshotCurrencies.btc, 'BTC');
  const ltcRub = addSnapshot(snapshotCurrencies.ltc, 'LTC');
  const usdtRub = addSnapshot(snapshotCurrencies.usdt, 'USDT');

  let offers: RateOffer[] = [];
  let usedFrom: NamedId | null = null;
  let usedTo: NamedId | null = null;

  if (pair && limit > 0) {
    const fromList = rankedCurrencies(currencies, pair.from);
    const toList = rankedCurrencies(currencies, pair.to);

    for (const from of fromList) {
      for (const to of toList) {
        offers = collectOffers(rows, from, to, exchangers, limit).map(
          (offer) => ({
            ...offer,
            from: pair.from,
            to: pair.to,
            rate: roundRate(offer.rate),
          }),
        );

        if (offers.length > 0) {
          usedFrom = from;
          usedTo = to;
          break;
        }
      }

      if (offers.length > 0) {
        break;
      }
    }

    if (offers.length === 0) {
      for (const from of rankedCurrencies(currencies, pair.to)) {
        for (const to of rankedCurrencies(currencies, pair.from)) {
          offers = collectOffers(rows, from, to, exchangers, limit).map(
            (offer) => ({
              ...offer,
              from: pair.to,
              to: pair.from,
              rate: roundRate(offer.rate),
            }),
          );

          if (offers.length > 0) {
            usedFrom = from;
            usedTo = to;
            break;
          }
        }

        if (offers.length > 0) {
          break;
        }
      }
    }
  }

  const snapshotText = [
    `BTC-Rub ${btcRub ?? '—'}`,
    `LTC-Rub ${ltcRub ?? '—'}`,
    `USDT-RUB ${usdtRub ?? '—'}`,
  ].join('\n');

  const offerText =
    offers.length > 0 && usedFrom && usedTo
      ? [
          `BestChange ${offers[0].from} → ${offers[0].to} (${usedFrom.name} → ${usedTo.name}), топ-${offers.length}:`,
          ...offers.map((offer, index) => {
            const reserve =
              offer.reserve == null
                ? ''
                : `, резерв ${formatOfferRate(offer.reserve)}`;

            return `${index + 1}. ${offer.exchanger} — ${formatOfferRate(offer.rate)} ${offer.to} за 1 ${offer.from}${reserve}`;
          }),
        ].join('\n')
      : pair
        ? `BestChange: нет предложений ${pair.from} → ${pair.to} в api.bestchange.ru/info.zip`
        : snapshotText;

  if (pair && limit > 0 && !usedFrom) {
    throw new Error(
      `BestChange: не нашёл валюты ${pair.from}/${pair.to} в bm_cy.dat`,
    );
  }

  if (!pair && (!snapshotCurrencies.btc || !snapshotCurrencies.ltc || !snapshotCurrencies.usdt || rubIds.length === 0)) {
    throw new Error(
      'BestChange: не разобрал валюты BTC/LTC/USDT/RUB в bm_cy.dat',
    );
  }

  return {
    btcRub,
    ltcRub,
    usdtRub,
    pair: offers[0] ? `${offers[0].from}/${offers[0].to}` : null,
    from: offers[0]?.from ?? null,
    to: offers[0]?.to ?? null,
    quotes,
    offers,
    text: offerText,
    source: 'api.bestchange.ru/info.zip',
  };
};

const zipText = (archive: Buffer, fileName: string, decode = false): string => {
  try {
    const buffer = zipRead(archive, fileName);

    return decode ? decodeCy(buffer) : buffer.toString('latin1');
  } catch {
    return '';
  }
};

export const bestchangeRates = async (options?: {
  from?: string;
  to?: string;
  limit?: number;
}): Promise<BestChangeRates> => {
  const archive = await downloadZip();

  return parseBestChangeData(
    {
      cy: zipText(archive, 'bm_cy.dat', true),
      rates: zipText(archive, 'bm_rates.dat'),
      exch: zipText(archive, 'bm_exch.dat', true),
    },
    options,
  );
};
