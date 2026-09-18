import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { droppedPath, parseWaitUntil, waitUntilAttempts } from './chromium';

describe('chromium navigation', () => {
  it('defaults to domcontentloaded', () => {
    assert.equal(parseWaitUntil(undefined), 'domcontentloaded');
    assert.equal(parseWaitUntil('load'), 'load');
  });

  it('retries load with lighter waitUntil after HTTP/2 errors', () => {
    assert.deepEqual(waitUntilAttempts('load'), [
      'load',
      'domcontentloaded',
      'commit',
    ]);
  });
});

describe('droppedPath', () => {
  it('flags a deep link that ended on the domain root', () => {
    assert.equal(
      droppedPath('https://www.bybit.com/fiat/trade/otc', 'https://www.bybit.com/'),
      true,
    );
  });

  it('accepts staying on a meaningful path', () => {
    assert.equal(
      droppedPath('https://site.com/a/b', 'https://site.com/a/b?x=1'),
      false,
    );
    assert.equal(droppedPath('https://site.com/', 'https://site.com/'), false);
  });
});
