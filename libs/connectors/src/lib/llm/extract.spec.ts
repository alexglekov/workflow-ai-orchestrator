import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildExtractSystem,
  coerceToSchema,
  coerceValue,
  parseNumberLike,
} from './extract';

describe('parseNumberLike', () => {
  it('reads plain and already-numeric values', () => {
    assert.equal(parseNumberLike(42), 42);
    assert.equal(parseNumberLike('42'), 42);
    assert.equal(parseNumberLike('42.5'), 42.5);
  });

  it('strips currency, units and thousands spaces', () => {
    assert.equal(parseNumberLike('95,50 ₽'), 95.5);
    assert.equal(parseNumberLike('1 234,56'), 1234.56);
    assert.equal(parseNumberLike('1\u00a0234\u00a0567'), 1234567);
    assert.equal(parseNumberLike('12%'), 12);
    assert.equal(parseNumberLike('- 8,3'), -8.3);
  });

  it('handles mixed comma/dot separators by rightmost decimal', () => {
    assert.equal(parseNumberLike('1,234.56'), 1234.56);
    assert.equal(parseNumberLike('1.234,56'), 1234.56);
    assert.equal(parseNumberLike('1.234.567'), 1234567);
  });

  it('returns null for non-numbers', () => {
    assert.equal(parseNumberLike('нет данных'), null);
    assert.equal(parseNumberLike(''), null);
    assert.equal(parseNumberLike(null), null);
    assert.equal(parseNumberLike({}), null);
  });
});

describe('coerceValue', () => {
  it('coerces number and integer specs', () => {
    assert.equal(coerceValue('95,50 ₽', 'number'), 95.5);
    assert.equal(coerceValue('12,7', 'integer'), 13);
    assert.equal(coerceValue('нет', 'number'), 'нет');
  });

  it('coerces booleans', () => {
    assert.equal(coerceValue('да', 'boolean'), true);
    assert.equal(coerceValue('0', 'bool'), false);
  });

  it('coerces arrays via string descriptor', () => {
    assert.deepEqual(coerceValue(['1 000', '2 500,5'], 'number[]'), [1000, 2500.5]);
  });

  it('leaves strings and unknown types untouched', () => {
    assert.equal(coerceValue('USDT', 'string'), 'USDT');
    assert.equal(coerceValue('USDT', 'ticker'), 'USDT');
  });
});

describe('coerceToSchema', () => {
  it('coerces only known keys and keeps the rest', () => {
    const data = {
      btcRub: '5 900 000,50 ₽',
      pair: 'BTC/RUB',
      change: '2,5%',
      active: 'да',
      extra: 'не в схеме',
    };
    const schema = {
      btcRub: 'number',
      pair: 'string',
      change: 'number',
      active: 'boolean',
    };

    assert.deepEqual(coerceToSchema(data, schema), {
      btcRub: 5900000.5,
      pair: 'BTC/RUB',
      change: 2.5,
      active: true,
      extra: 'не в схеме',
    });
  });

  it('coerces nested arrays of objects', () => {
    const data = {
      offers: [
        { price: '95,5', bank: 'Тинькофф' },
        { price: '96,0', bank: 'Сбер' },
      ],
    };
    const schema = { offers: [{ price: 'number', bank: 'string' }] };

    assert.deepEqual(coerceToSchema(data, schema), {
      offers: [
        { price: 95.5, bank: 'Тинькофф' },
        { price: 96, bank: 'Сбер' },
      ],
    });
  });

  it('is a no-op for string schema', () => {
    const data = { a: '1,5' };

    assert.deepEqual(coerceToSchema(data, 'freeform'), data);
  });
});

describe('buildExtractSystem', () => {
  it('mentions localized numbers and appends extra instruction', () => {
    const prompt = buildExtractSystem('только курс продажи');

    assert.match(prompt, /JSON/);
    assert.match(prompt, /Десятичный разделитель — точка/);
    assert.match(prompt, /только курс продажи/);
  });
});
