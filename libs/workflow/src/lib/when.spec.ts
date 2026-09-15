import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { matchWhen } from './when';
import { templateContext } from '@ai-worker/connectors';

describe('matchWhen', () => {
  it('empty and true always run', () => {
    const ctx = templateContext({});

    assert.equal(matchWhen(undefined, ctx), true);
    assert.equal(matchWhen('', ctx), true);
    assert.equal(matchWhen(true, ctx), true);
    assert.equal(matchWhen('true', ctx), true);
  });

  it('compares interpolated label', () => {
    const ctx = templateContext({
      previous: { label: 'intervene' },
    });

    assert.equal(matchWhen('{{previous.label}} = intervene', ctx), true);
    assert.equal(matchWhen('{{previous.label}} = skip', ctx), false);
    assert.equal(matchWhen('{{previous.label}} != skip', ctx), true);
  });

  it('compares numbers', () => {
    const ctx = templateContext({ previous: { count: 3 } });

    assert.equal(matchWhen('{{previous.count}} > 2', ctx), true);
    assert.equal(matchWhen('{{previous.count}} >= 3', ctx), true);
    assert.equal(matchWhen('{{previous.count}} < 3', ctx), false);
  });
});
