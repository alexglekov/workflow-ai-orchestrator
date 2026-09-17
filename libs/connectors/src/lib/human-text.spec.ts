import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { humanText, isJsonDump } from './human-text';

describe('humanText', () => {
  it('formats a Binance ticker instead of JSON', () => {
    const text = humanText({
      url: 'https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT',
      contentType: 'application/json',
      text: JSON.stringify({
        symbol: 'BTCUSDT',
        lastPrice: '95000.12',
        priceChangePercent: '-1.24',
        volume: '1234',
      }),
      json: {
        symbol: 'BTCUSDT',
        lastPrice: '95000.12',
        priceChangePercent: '-1.24',
        volume: '1234',
      },
    });

    assert.match(text, /BTCUSDT/);
    assert.match(text, /Цена: 95000.12/);
    assert.match(text, /Изменение, %: -1.24%/);
    assert.equal(text.includes('{'), false);
  });

  it('keeps telegram messages as a line per person', () => {
    assert.equal(
      humanText({
        text: 'Hi',
        count: 1,
        items: [{ text: 'Hi', username: 'alex', chatId: '1' }],
      }),
      'alex: Hi',
    );
  });

  it('does not dump an empty telegram event', () => {
    assert.equal(
      humanText({
        count: 0,
        items: [],
        messages: [],
        source: 'event',
      }),
      '',
    );
  });

  it('formats leftover object fields', () => {
    assert.equal(humanText({ a: 1, b: 'ok' }), 'A: 1\nB: ok');
  });
});

describe('isJsonDump', () => {
  it('detects a JSON object string', () => {
    assert.equal(isJsonDump('{"symbol":"BTCUSDT"}'), true);
    assert.equal(isJsonDump('Цена BTC 95 000'), false);
  });
});
