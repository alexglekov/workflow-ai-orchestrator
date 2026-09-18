import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { PublicResponse } from './fetch-public';
import { fetchP2pBook, type PublicFetcher } from './p2p';

const bybitResponse = {
  ret_code: 0,
  result: {
    count: 2,
    items: [
      {
        price: '0.845',
        lastQuantity: '4.9122',
        minAmount: '2.000',
        maxAmount: '85.000',
        nickName: 'lukasleon',
        finishNum: 17,
        recentExecuteRate: 100,
        payments: ['752', '328'],
      },
      {
        price: '0.850',
        lastQuantity: '10.5',
        minAmount: '5.000',
        maxAmount: '500.000',
        nickName: 'trader2',
        finishNum: 40,
        recentExecuteRate: 98,
        payments: ['158'],
      },
    ],
  },
};

const stubFetcher = () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const fetchImpl: PublicFetcher = async (url, options) => {
    calls.push({ url, body: JSON.parse(String(options?.body ?? '{}')) });

    return {
      url,
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(bybitResponse),
      cookie: '',
    } satisfies PublicResponse;
  };

  return { calls, fetchImpl };
};

describe('fetchP2pBook', () => {
  it('returns null when the prompt is not a supported P2P request', async () => {
    assert.equal(await fetchP2pBook('просто курс USDT'), null);
    assert.equal(await fetchP2pBook('okx p2p usdt/rub'), null);
  });

  it('normalizes Bybit offers into a readable book', async () => {
    const { calls, fetchImpl } = stubFetcher();
    const book = await fetchP2pBook(
      'отслеживать байбит страницы п2п по валютной паре USDT/EUR',
      2,
      fetchImpl,
    );

    assert.ok(book);
    assert.equal(book?.brand, 'bybit');
    assert.equal(book?.side, 'buy');
    assert.equal(book?.offers.length, 2);
    assert.equal(book?.offers[0].price, 0.845);
    assert.match(book?.text ?? '', /Revolut/);
    assert.match(book?.text ?? '', /0\.845 EUR за 1 USDT/);

    assert.equal((calls[0].body as { tokenId: string }).tokenId, 'USDT');
    assert.equal((calls[0].body as { currencyId: string }).currencyId, 'EUR');
    assert.equal((calls[0].body as { side: string }).side, '1');
  });

  it('requests the sell book for a sell prompt', async () => {
    const { calls, fetchImpl } = stubFetcher();

    await fetchP2pBook('bybit p2p продать USDT/EUR', 2, fetchImpl);

    assert.equal((calls[0].body as { side: string }).side, '0');
  });
});
