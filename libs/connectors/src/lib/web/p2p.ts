import { fetchPublic, type PublicResponse, type FetchPublicOptions } from './fetch-public';
import { p2pTarget, type P2pBrand, type P2pTarget } from './site';

export type PublicFetcher = (
  url: string,
  options?: FetchPublicOptions,
) => Promise<PublicResponse>;

export type P2pOffer = {
  price: number;
  currency: string;
  token: string;
  available: number;
  minAmount: number;
  maxAmount: number;
  merchant: string;
  orders: number;
  completionRate: number;
  payments: string[];
};

export type P2pBook = {
  brand: P2pBrand;
  token: string;
  fiat: string;
  side: 'buy' | 'sell';
  offers: P2pOffer[];
  text: string;
  source: string;
};

/** Способы оплаты Bybit приходят кодами — переводим частые в человеческие. */
const BYBIT_PAYMENTS: Record<string, string> = {
  '14': 'Bank Transfer',
  '75': 'SEPA',
  '78': 'SEPA (instant)',
  '158': 'Wise',
  '303': 'Revolut',
  '328': 'Bank Transfer (SEPA)',
  '752': 'Revolut',
  '377': 'PayPal',
  '64': 'Cash',
};

const num = (value: unknown): number => {
  const parsed = Number(String(value ?? '').replace(/[^\d.-]/g, ''));

  return Number.isFinite(parsed) ? parsed : 0;
};

const fmt = (value: number): string =>
  value >= 1000
    ? value.toLocaleString('ru-RU', { maximumFractionDigits: 0 })
    : String(value);

const composeText = (book: Omit<P2pBook, 'text'>): string => {
  const verb = book.side === 'buy' ? 'покупки' : 'продажи';

  if (!book.offers.length) {
    return `${book.brand} P2P: предложений для ${verb} ${book.token}/${book.fiat} не найдено.`;
  }

  const lines = book.offers.map((offer, index) => {
    const limits = `лимит ${fmt(offer.minAmount)}–${fmt(offer.maxAmount)} ${offer.currency}`;
    const volume = `доступно ${fmt(offer.available)} ${offer.token}`;
    const pay = offer.payments.length ? `, оплата: ${offer.payments.join(', ')}` : '';
    const rep =
      offer.orders > 0
        ? `, ${offer.merchant} (${offer.orders} сделок, ${offer.completionRate}%)`
        : offer.merchant
          ? `, ${offer.merchant}`
          : '';

    return `${index + 1}. ${offer.price} ${offer.currency} за 1 ${offer.token} — ${volume}, ${limits}${pay}${rep}`;
  });

  return [
    `${book.brand} P2P — топ ${book.offers.length} для ${verb} ${book.token}/${book.fiat}:`,
    ...lines,
  ].join('\n');
};

const fetchBybit = async (
  target: P2pTarget,
  limit: number,
  fetchImpl: PublicFetcher,
): Promise<P2pOffer[]> => {
  const response = await fetchImpl('https://api2.bybit.com/fiat/otc/item/online', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tokenId: target.token,
      currencyId: target.fiat,
      side: target.side === 'buy' ? '1' : '0',
      page: '1',
      size: String(Math.min(Math.max(limit, 1), 20)),
    }),
    timeoutMs: 20_000,
    retries: 1,
  });

  const parsed = JSON.parse(response.body) as {
    result?: { items?: Array<Record<string, unknown>> };
  };

  return (parsed.result?.items ?? []).slice(0, limit).map((item) => {
    const payments = Array.isArray(item['payments'])
      ? (item['payments'] as unknown[]).map(
          (code) => BYBIT_PAYMENTS[String(code)] || `#${code}`,
        )
      : [];

    return {
      price: num(item['price']),
      currency: target.fiat,
      token: target.token,
      available: num(item['lastQuantity']),
      minAmount: num(item['minAmount']),
      maxAmount: num(item['maxAmount']),
      merchant: String(item['nickName'] || '').trim(),
      orders: num(item['finishNum']),
      completionRate: num(item['recentExecuteRate']),
      payments,
    };
  });
};

/** Живой стакан P2P через публичный API биржи. Пока поддержан Bybit. */
export const fetchP2pBook = async (
  prompt: string,
  limit = 10,
  fetchImpl: PublicFetcher = fetchPublic,
): Promise<P2pBook | null> => {
  const target = p2pTarget(prompt);

  if (!target || target.brand !== 'bybit') {
    return null;
  }

  const offers = await fetchBybit(target, limit, fetchImpl);
  const base = {
    brand: target.brand,
    token: target.token,
    fiat: target.fiat,
    side: target.side,
    offers,
    source: 'bybit-otc-api',
  };

  return { ...base, text: composeText(base) };
};
