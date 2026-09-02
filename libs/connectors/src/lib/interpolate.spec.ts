import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { interpolate, templateContext } from './interpolate';

describe('interpolate', () => {
  it('replaces previous field', () => {
    const value = interpolate(
      'hello {{previous.x}}',
      templateContext({ previous: { x: 'world' } }),
    );

    assert.equal(value, 'hello world');
  });

  it('walks nested objects and item', () => {
    const value = interpolate(
      { text: '{{item.subject}} / {{input.city}}' },
      templateContext({
        item: { subject: 'счёт' },
        input: { city: 'Москва' },
      }),
    );

    assert.deepEqual(value, { text: 'счёт / Москва' });
  });

  it('stringifies objects for {{previous}}', () => {
    const value = interpolate(
      '{{previous}}',
      templateContext({ previous: { a: 1 } }),
    );

    assert.equal(value, '{\n  "a": 1\n}');
  });
});
