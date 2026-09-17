import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  planFromCatalog,
  searchPhrase,
  type PlanCatalogConnector,
} from './catalog-plan';

const catalog: PlanCatalogConnector[] = [
  {
    id: 'web',
    name: 'Web',
    actions: [
      { id: 'search', name: 'Найти' },
      { id: 'fetch', name: 'Открыть' },
      { id: 'rates', name: 'Курсы' },
    ],
  },
  {
    id: 'browser',
    name: 'Browser',
    actions: [{ id: 'open', name: 'Открыть страницу' }],
  },
  {
    id: 'llm',
    name: 'LLM',
    actions: [
      { id: 'classify', name: 'Классифицировать' },
      { id: 'extract', name: 'Извлечь' },
      { id: 'generate', name: 'Написать' },
    ],
  },
  {
    id: 'telegram',
    name: 'Telegram',
    actions: [{ id: 'send_message', name: 'Сообщение' }],
  },
];

const keys = (prompt: string) =>
  planFromCatalog(prompt, catalog).map(
    (step) => `${step.connectorId}.${step.action}`,
  );

describe('planFromCatalog', () => {
  it('adds browser.open for SPA/Playwright', () => {
    const steps = keys('открой SPA в браузере playwright javascript');

    assert.ok(steps.includes('browser.open'));
  });

  it('sets when on telegram after classify', () => {
    const steps = planFromCatalog(
      'классифицируй намерение вмешаться и напиши в телеграм',
      catalog,
    );
    const telegram = steps.find(
      (step) => step.connectorId === 'telegram' && step.action === 'send_message',
    );

    assert.ok(telegram);
    assert.equal(telegram?.params['when'], '{{previous.label}} = intervene');
  });

  it('uses web.rates for BestChange, not fetch', () => {
    const steps = keys('пришли курс bestchange btc usdt в телеграм');

    assert.ok(steps.includes('web.rates'));
    assert.ok(!steps.includes('web.fetch'));
  });

  it('fetches Binance ticker instead of BestChange rates', () => {
    const steps = planFromCatalog(
      'Собери все данные о курсе валютной паре BTC/USDT с binance и отправь мне в тг каждый час',
      catalog,
    );
    const fetch = steps.find(
      (step) => step.connectorId === 'web' && step.action === 'fetch',
    );

    assert.ok(fetch);
    assert.equal(
      fetch?.params['url'],
      'https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT',
    );
    assert.ok(!steps.some((step) => step.action === 'rates'));
    assert.ok(
      steps.some(
        (step) =>
          step.connectorId === 'telegram' && step.action === 'send_message',
      ),
    );
  });
});

describe('searchPhrase', () => {
  it('strips schedule and delivery noise', () => {
    const query = searchPhrase(
      'каждое утро в 9 найди в интернете новости про ЦБ и пришли в телеграм',
    );

    assert.ok(query.includes('новости про ЦБ'));
    assert.equal(/телеграм|каждое утро|найди/i.test(query), false);
  });

  it('keeps the prompt when nothing meaningful is left', () => {
    assert.equal(searchPhrase('найди'), 'найди');
  });
});
