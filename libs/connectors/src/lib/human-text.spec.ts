import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { humanText, isJsonDump, runReplyText } from './human-text';

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

  it('prints excel rows instead of a dump', () => {
    assert.equal(
      humanText({
        fileName: 'заявки.xlsx',
        rows: [{ Имя: 'Иван', Телефон: '7900' }],
        count: 1,
      }),
      'Имя: Иван\nТелефон: 7900',
    );
    assert.equal(
      humanText({ fileName: 'заявки.xlsx', rows: [], count: 0 }),
      'В таблице нет таких строк',
    );
    assert.equal(
      humanText({
        fileName: 'заявки.xlsx',
        rows: [{ Имя: 'Иван' }],
        text: 'Удалил дубли, осталась 1 строка',
        count: 1,
      }),
      'Удалил дубли, осталась 1 строка',
    );
  });
});

describe('runReplyText', () => {
  it('prefers the generated summary over search dump', () => {
    assert.equal(
      runReplyText([
        {
          connectorId: 'web',
          action: 'search',
          status: 'success',
          output: { answer: 'long search dump', results: [{ title: 'x' }] },
        },
        {
          connectorId: 'llm',
          action: 'generate',
          status: 'success',
          output: { text: 'Курс BTC на Binance — 95 000 USDT.' },
        },
      ]),
      'Курс BTC на Binance — 95 000 USDT.',
    );
  });

  it('does not treat a telegram ok flag as the reply', () => {
    assert.equal(
      runReplyText([
        {
          connectorId: 'llm',
          action: 'generate',
          status: 'success',
          output: { text: 'Сводка готова: всё спокойно.' },
        },
        {
          connectorId: 'telegram',
          action: 'send_message',
          status: 'success',
          input: { text: 'Сводка готова: всё спокойно.' },
          output: { ok: true, messageId: 12 },
        },
      ]),
      'Сводка готова: всё спокойно.',
    );
  });

  it('ignores a heading without the actual list', () => {
    assert.equal(
      runReplyText([
        {
          connectorId: 'telegram',
          action: 'send_message',
          status: 'success',
          input: {
            text: 'Топ-10 предложения по валютной паре USDT/EUR на Bybit P2P:',
          },
          output: { sent: true },
        },
      ]),
      '',
    );
  });
});

describe('isJsonDump', () => {
  it('detects a JSON object string', () => {
    assert.equal(isJsonDump('{"symbol":"BTCUSDT"}'), true);
    assert.equal(isJsonDump('Цена BTC 95 000'), false);
  });
});
