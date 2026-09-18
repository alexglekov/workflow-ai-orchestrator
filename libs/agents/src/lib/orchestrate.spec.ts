import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  inferChatIntent,
  inferChatProvider,
  parseChatRoute,
} from './orchestrate';

describe('inferChatIntent', () => {
  it('treats a new task as plan', () => {
    assert.equal(
      inferChatIntent(
        'Сделай бота который на любое входящее в telegram отвечает хорошо',
        false,
      ),
      'plan',
    );
  });

  it('treats collect-and-send on a schedule as plan', () => {
    assert.equal(
      inferChatIntent(
        'Собери все данные о курсе валютной паре BTC/USDT с binance и отправь мне в тг каждый час',
        false,
      ),
      'plan',
    );
  });

  it('treats a point edit as plan', () => {
    assert.equal(inferChatIntent('добавь фильтр по сумме', true), 'plan');
  });

  it('does not replan when asked to run a report now', () => {
    assert.equal(
      inferChatIntent('сделай мне отчет не взирая на таймер', true),
      'ask',
    );
    assert.equal(inferChatIntent('пришли отчёт сейчас', true), 'ask');
  });

  it('treats a question as ask', () => {
    assert.equal(
      inferChatIntent('Как работает Telegram для бизнеса?', true),
      'ask',
    );
  });

  it('treats a short question mark as ask when workflow exists', () => {
    assert.equal(inferChatIntent('что делает этот шаг?', true), 'ask');
  });
});

describe('inferChatProvider', () => {
  it('returns the only available worker', () => {
    assert.equal(inferChatProvider('hello', ['openai']), 'openai');
  });

  it('prefers Qwen for a typical Russian bot task', () => {
    assert.equal(
      inferChatProvider('Сделай бота в телеграме', ['qwen', 'openai']),
      'qwen',
    );
  });
});

describe('parseChatRoute', () => {
  const fallback = { intent: 'plan' as const, providerId: 'qwen' as const };

  it('reads intent and provider from JSON', () => {
    assert.deepEqual(
      parseChatRoute(
        '{"intent":"ask","provider":"openai"}',
        fallback,
      ),
      { intent: 'ask', providerId: 'openai' },
    );
  });

  it('keeps fallback on invalid JSON', () => {
    assert.deepEqual(parseChatRoute('not-json', fallback), fallback);
  });
});
