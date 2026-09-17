import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseScheduleReply } from './schedule';

describe('parseScheduleReply', () => {
  it('reads hourly JSON', () => {
    assert.deepEqual(parseScheduleReply('{"everyMinutes":60,"at":null}'), {
      everyMinutes: 60,
    });
  });

  it('reads a daily clock', () => {
    assert.deepEqual(
      parseScheduleReply('{"everyMinutes":1440,"at":"9:00"}'),
      { everyMinutes: 1440, at: '09:00' },
    );
  });

  it('drops a one-off', () => {
    assert.equal(
      parseScheduleReply('{"everyMinutes":null,"at":null}'),
      null,
    );
  });
});
