import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { planFromCatalog, type PlanCatalogConnector } from './catalog-plan';

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
});
