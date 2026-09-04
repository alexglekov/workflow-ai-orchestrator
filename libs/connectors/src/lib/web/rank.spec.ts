import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { canonicalUrl, hostOf, isUsableUrl, rankHits } from './rank';
import type { SearchHit } from './rank';

const hit = (partial: Partial<SearchHit>): SearchHit => ({
  title: 'Заголовок',
  url: 'https://example.com/',
  snippet: '',
  ...partial,
});

describe('canonicalUrl', () => {
  it('drops tracking params, www and trailing slash', () => {
    assert.equal(
      canonicalUrl('https://WWW.Example.com/page/?utm_source=ya&id=7#top'),
      'https://example.com/page?id=7',
    );
  });
});

describe('isUsableUrl', () => {
  it('rejects ads, assets and non-http links', () => {
    assert.equal(isUsableUrl('https://duckduckgo.com/y.js?ad_provider=x'), false);
    assert.equal(isUsableUrl('https://cdn.example.com/logo.png'), false);
    assert.equal(isUsableUrl('mailto:me@example.com'), false);
    assert.equal(isUsableUrl('https://example.com/article'), true);
  });
});

describe('rankHits', () => {
  it('deduplicates the same page found by several providers', () => {
    const results = rankHits(
      [
        hit({ url: 'https://example.com/a', provider: 'brave' }),
        hit({ url: 'https://www.example.com/a/?utm_source=x', provider: 'duckduckgo', snippet: 'текст' }),
      ],
      'заголовок',
      5,
    );

    assert.equal(results.length, 1);
    assert.equal(results[0].snippet, 'текст');
  });

  it('ranks pages matching the query higher', () => {
    const results = rankHits(
      [
        hit({ title: 'Другое', url: 'https://one.com/x', snippet: 'ничего' }),
        hit({ title: 'Курс USDT к рублю', url: 'https://two.com/x', snippet: 'курс USDT' }),
      ],
      'курс USDT',
      5,
    );

    assert.equal(hostOf(results[0].url), 'two.com');
  });

  it('does not let one host take over the output', () => {
    const results = rankHits(
      [
        hit({ url: 'https://one.com/1' }),
        hit({ url: 'https://one.com/2' }),
        hit({ url: 'https://one.com/3' }),
        hit({ url: 'https://two.com/1' }),
      ],
      'заголовок',
      3,
    );

    assert.equal(results.filter((item) => item.host === 'one.com').length, 2);
    assert.ok(results.some((item) => item.host === 'two.com'));
  });

  it('skips junk urls and empty titles', () => {
    const results = rankHits(
      [
        hit({ url: 'https://duckduckgo.com/y.js?ad=1' }),
        hit({ title: '   ', url: 'https://example.com/ok' }),
        hit({ url: 'https://good.com/page' }),
      ],
      'заголовок',
      5,
    );

    assert.deepEqual(
      results.map((item) => item.host),
      ['good.com'],
    );
  });
});
