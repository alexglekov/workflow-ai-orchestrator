import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isDue } from './is-due';

describe('isDue', () => {
  it('waits until HH:MM in the trigger timezone', () => {
    const config = { at: '09:00', timezone: 'Europe/Moscow' };
    const before = new Date('2026-09-02T05:59:00Z');
    const after = new Date('2026-09-02T06:01:00Z');

    assert.equal(isDue(config, 'schedule', null, before), false);
    assert.equal(isDue(config, 'schedule', null, after), true);
  });

  it('does not fire twice the same local day', () => {
    const config = { at: '09:00', timezone: 'Europe/Moscow' };
    const now = new Date('2026-09-02T10:00:00Z');
    const sameDay = new Date('2026-09-02T06:05:00Z');
    const yesterday = new Date('2026-09-01T10:00:00Z');

    assert.equal(isDue(config, 'schedule', sameDay, now), false);
    assert.equal(isDue(config, 'schedule', yesterday, now), true);
  });

  it('catches up if at already passed today', () => {
    const config = { at: '09:00', timezone: 'Europe/Moscow' };
    const evening = new Date('2026-09-02T18:00:00Z');

    assert.equal(isDue(config, 'schedule', null, evening), true);
  });

  it('uses interval for mail polling', () => {
    const config = { everyMinutes: 2 };
    const now = new Date('2026-09-02T12:00:00Z');
    const recent = new Date(now.getTime() - 60_000);
    const old = new Date(now.getTime() - 3 * 60_000);

    assert.equal(isDue(config, 'mail', recent, now), false);
    assert.equal(isDue(config, 'mail', old, now), true);
  });
});
