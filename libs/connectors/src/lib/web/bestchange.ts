import { USER_AGENT } from './ssrf';
import { zipRead } from './zip';

const SOURCES = [
  'https://api.bestchange.ru/info.zip',
  'http://api.bestchange.ru/info.zip',
];

export type RateQuote = {
  from: string;
  to: string;
  fromId: number;
  toId: number;
  rate: number;
};

const decodeCy = (buffer: Buffer): string => {
  try {
    return new TextDecoder('windows-1251').decode(buffer);
  } catch {
    return buffer.toString('latin1');
  }
};

const parseCurrencies = (
  text: string,
): Array<{ id: number; name: string }> =>
  text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(';');
      const id = Number(parts[0]);
      const name = parts.slice(1).join(';');

      return { id, name };
    })
    .filter((item) => Number.isFinite(item.id) && item.name);

const pickCurrency = (
  items: Array<{ id: number; name: string }>,
  matcher: (name: string) => boolean,
): { id: number; name: string } | null =>
  items.find((item) => matcher(item.name)) ?? null;

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

const downloadZip = async (): Promise<Buffer> => {
  let lastError: Error | null = null;

  for (const url of SOURCES) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/zip,*/*' },
        signal: AbortSignal.timeout(30_000),
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
  value >= 100 ? Math.round(value * 100) / 100 : Math.round(value * 1_000_000) / 1_000_000;

export const bestchangeRates = async (): Promise<{
  btcRub: number | null;
  ltcRub: number | null;
  usdtRub: number | null;
  quotes: RateQuote[];
  text: string;
  source: string;
}> => {
  const archive = await downloadZip();
  const currencies = parseCurrencies(decodeCy(zipRead(archive, 'bm_cy.dat')));
  const ratesText = zipRead(archive, 'bm_rates.dat').toString('latin1');
  const rows = ratesText.split(/\r?\n/).filter(Boolean);

  const btc = pickCurrency(currencies, isBtc);
  const ltc = pickCurrency(currencies, isLtc);
  const usdt =
    pickCurrency(currencies, isUsdt) || pickCurrency(currencies, isUsdtFallback);
  const rubList = currencies.filter(
    (item) => isRubRail(item.name) || isRubFallback(item.name),
  );
  const rubIds = (rubList.length ? rubList : currencies.filter((item) => /RUB/i.test(item.name)))
    .map((item) => item.id);

  if (!btc || !ltc || !usdt || rubIds.length === 0) {
    throw new Error(
      'BestChange: не разобрал валюты BTC/LTC/USDT/RUB в bm_cy.dat',
    );
  }

  const quotes: RateQuote[] = [];
  const add = (
    from: { id: number; name: string },
    key: string,
  ): number | null => {
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

  const btcRub = add(btc, 'BTC');
  const ltcRub = add(ltc, 'LTC');
  const usdtRub = add(usdt, 'USDT');

  const text = [
    `BTC-Rub ${btcRub ?? '—'}`,
    `LTC-Rub ${ltcRub ?? '—'}`,
    `USDT-RUB ${usdtRub ?? '—'}`,
  ].join('\n');

  return {
    btcRub,
    ltcRub,
    usdtRub,
    quotes,
    text,
    source: 'api.bestchange.ru/info.zip',
  };
};
