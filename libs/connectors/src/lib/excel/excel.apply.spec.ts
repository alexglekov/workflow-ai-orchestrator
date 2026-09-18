import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { factsFromPrevious, planFromModelJson } from './excel.apply';

describe('excel.apply plan', () => {
  it('turns a bare rows payload into replace', () => {
    const plan = planFromModelJson(
      {
        text: 'Добавил итог',
        rows: [{ Клиент: 'Иван', Сумма: 10, Итого: 10 }],
        headers: ['Клиент', 'Сумма', 'Итого'],
      },
      ['Клиент', 'Сумма'],
    );

    assert.equal(plan.text, 'Добавил итог');
    assert.equal(plan.operations[0]?.type, 'replace');
    assert.equal(plan.operations[0]?.rows?.[0]?.['Итого'], 10);
  });

  it('keeps explicit operations', () => {
    const plan = planFromModelJson(
      {
        summary: 'Удалил дубли',
        operations: [{ type: 'delete', field: 'Клиент', op: 'eq', value: 'Анна' }],
      },
      ['Клиент'],
    );

    assert.equal(plan.summary, 'Удалил дубли');
    assert.equal(plan.operations[0]?.type, 'delete');
  });

  it('stringifies previous search context', () => {
    const text = factsFromPrevious({
      text: 'USDT 95.1',
      results: [{ title: 'курс', url: 'https://x.test', snippet: '95.1' }],
    });

    assert.match(text, /USDT 95.1/);
    assert.match(text, /курс/);
    assert.match(text, /95\.1/);
  });
});
