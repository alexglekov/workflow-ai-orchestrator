import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  bestchangePageUrl,
  hostMatchesSite,
  namedSite,
  p2pPageUrl,
  p2pSearchQuery,
  pickResultUrl,
  wantsPageVisit,
} from './site';

describe('namedSite', () => {
  it('resolves a domain and a typed brand, including typos', () => {
    assert.equal(namedSite('смотри nalog.gov.ru')?.host, 'nalog.gov.ru');
    assert.equal(namedSite('зайди на bybit и сравни оферты')?.host, 'bybit.com');
    assert.equal(namedSite('отслеживать байбит страницы п2п')?.host, 'bybit.com');
    assert.equal(
      namedSite(
        'зайди на bestchnage и отправь сводку о топ 10 предложений usdt/btc',
      )?.host,
      'bestchange.ru',
    );
  });
});

describe('p2pPageUrl', () => {
  it('builds a Bybit P2P book url from the pair', () => {
    assert.equal(
      p2pPageUrl('отслеживать bybit p2p и топ 10 предложений USDT/EUR'),
      'https://www.bybit.com/en/fiat/trade/otc/buy/USDT/EUR',
    );
    assert.equal(
      p2pPageUrl(
        'Сделай бота который будет отслеживать все байбит страницы п2п и присылать отчет мне в тг по топ 10 предложениям по валютной паре USDT/EUR',
      ),
      'https://www.bybit.com/en/fiat/trade/otc/buy/USDT/EUR',
    );
    assert.equal(p2pPageUrl('просто курс usdt/eur'), '');
  });
});

describe('wantsPageVisit', () => {
  it('detects go-to-site phrasing', () => {
    assert.equal(wantsPageVisit('зайди на example.com и сними таблицу'), true);
    assert.equal(wantsPageVisit('просто посчитай 2+2'), false);
  });
});

describe('p2pSearchQuery', () => {
  it('builds a buy-otc phrase from exchange and pair', () => {
    assert.equal(
      p2pSearchQuery(
        'отслеживать байбит страницы п2п по валютной паре USDT/EUR',
      ),
      'bybit p2p buy USDT EUR otc',
    );
  });
});

describe('pickResultUrl', () => {
  it('prefers the named host over the first search hit', () => {
    assert.equal(
      pickResultUrl(
        [
          { url: 'https://wikipedia.org/wiki/USDT' },
          { url: 'https://www.bestchange.ru/tether-trc20-to-bitcoin.html' },
        ],
        'bestchange.ru',
      ),
      'https://www.bestchange.ru/tether-trc20-to-bitcoin.html',
    );
  });

  it('prefers a P2P book over the exchange homepage', () => {
    assert.equal(
      pickResultUrl(
        [
          { url: 'https://www.bybit.com/' },
          { url: 'https://www.bybit.com/en/fiat/trade/otc/buy/USDT/EUR' },
        ],
        'bybit.com',
      ),
      'https://www.bybit.com/en/fiat/trade/otc/buy/USDT/EUR',
    );
  });
});

describe('hostMatchesSite', () => {
  it('matches www and related hosts', () => {
    assert.equal(
      hostMatchesSite('https://www.bestchange.ru/x', 'bestchange.ru'),
      true,
    );
    assert.equal(hostMatchesSite('https://other.com/x', 'bestchange.ru'), false);
  });
});

describe('bestchangePageUrl', () => {
  it('builds a monitor url from the pair, even with a typo', () => {
    assert.equal(
      bestchangePageUrl(
        'зайди на bestchnage и отправь сводку о топ 10 предложений usdt/btc',
      ),
      'https://www.bestchange.ru/tether-trc20-to-bitcoin.html',
    );
    assert.equal(bestchangePageUrl('просто курс usdt/btc'), '');
  });
});
