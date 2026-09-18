import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseTavilyExtract } from './extract';

describe('parseTavilyExtract', () => {
  it('reads raw_content from Tavily extract', () => {
    const hits = parseTavilyExtract(
      JSON.stringify({
        results: [
          {
            url: 'https://www.bybit.com/en/fiat/trade/otc/buy/USDT/EUR',
            raw_content: '1. MerchantA 0.92 EUR\n2. MerchantB 0.93 EUR',
          },
          { url: 'https://empty.example', raw_content: '  ' },
        ],
        failed_results: [],
      }),
    );

    assert.equal(hits.length, 1);
    assert.equal(
      hits[0]?.url,
      'https://www.bybit.com/en/fiat/trade/otc/buy/USDT/EUR',
    );
    assert.match(hits[0]?.text || '', /MerchantA/);
  });

  it('returns nothing when extract is empty', () => {
    assert.deepEqual(parseTavilyExtract('{"results":[]}'), []);
  });
});
