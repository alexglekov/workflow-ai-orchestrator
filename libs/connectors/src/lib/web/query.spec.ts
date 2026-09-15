import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildQuery, normalizeQuery, queryTerms } from './query';

describe('normalizeQuery', () => {
  it('collapses whitespace and drops markup noise', () => {
    assert.equal(
      normalizeQuery('  «Ромашка»   ИНН\n\n7701234567  '),
      'Ромашка ИНН 7701234567',
    );
  });

  it('unwraps JSON from a previous step', () => {
    assert.equal(
      normalizeQuery('{"query": "курс USDT", "limit": 5}'),
      'курс USDT',
    );
  });

  it('unwraps an object and prefers meaningful fields', () => {
    assert.equal(normalizeQuery({ inn: '7701234567' }), '7701234567');
  });

  it('replaces links with their host', () => {
    assert.equal(
      normalizeQuery('отзывы https://www.example.com/page?a=1 качество'),
      'отзывы example.com качество',
    );
  });

  it('strips leading command words', () => {
    assert.equal(normalizeQuery('найди курс биткоина'), 'курс биткоина');
  });

  it('cuts long input at a word boundary', () => {
    const query = normalizeQuery('слово '.repeat(100), 40);

    assert.ok(query.length <= 40);
    assert.equal(query.endsWith('слов'), false);
  });
});

describe('buildQuery', () => {
  it('adds a site filter from a bare domain or url', () => {
    assert.equal(
      buildQuery({ query: 'реквизиты', site: 'https://nalog.gov.ru/page' }),
      'реквизиты site:nalog.gov.ru',
    );
  });
});

describe('queryTerms', () => {
  it('keeps meaningful terms only', () => {
    assert.deepEqual(queryTerms('как купить USDT для рубля'), [
      'купить',
      'usdt',
      'рубля',
    ]);
  });

  it('ignores the site operator', () => {
    assert.deepEqual(queryTerms('реквизиты site:nalog.gov.ru'), ['реквизиты']);
  });
});
