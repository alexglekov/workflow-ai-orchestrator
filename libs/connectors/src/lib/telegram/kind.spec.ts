import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseTelegramKindIntent } from './kind-intent';
import { resolveTelegramKind } from './platform';

describe('resolveTelegramKind', () => {
  it('defaults a token-only bot to simple mode', () => {
    assert.equal(resolveTelegramKind({ botToken: 'x' }), 'bot');
  });

  it('treats a business connection as account mode', () => {
    assert.equal(
      resolveTelegramKind({ businessConnectionId: 'bc' }),
      'business',
    );
  });

  it('honours an explicit kind', () => {
    assert.equal(
      resolveTelegramKind({
        telegramKind: 'bot',
        businessConnectionId: 'bc',
      }),
      'bot',
    );
    assert.equal(resolveTelegramKind({ telegramKind: 'business' }), 'business');
  });
});

describe('parseTelegramKindIntent', () => {
  it('reads a simple bot from chat', () => {
    assert.equal(
      parseTelegramKindIntent('сделай обычным ботом, без аккаунта'),
      'bot',
    );
    assert.equal(parseTelegramKindIntent('пусть отвечает в чате с ботом'), 'bot');
  });

  it('reads an account bot from the task', () => {
    assert.equal(
      parseTelegramKindIntent('отвечай клиентам от моего имени в Telegram'),
      'business',
    );
    assert.equal(
      parseTelegramKindIntent('подключи бота к аккаунту'),
      'business',
    );
  });

  it('lets an explicit switch win over the original task', () => {
    assert.equal(
      parseTelegramKindIntent('не для бизнеса, обычный бот'),
      'bot',
    );
  });

  it('ignores unrelated text', () => {
    assert.equal(parseTelegramKindIntent('пришли курс в телеграм'), null);
    assert.equal(parseTelegramKindIntent('найди клиента в 1С'), null);
  });
});
