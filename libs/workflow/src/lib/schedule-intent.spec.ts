import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  parseScheduleIntent,
  scheduleIntentLabel,
} from './schedule-intent';

describe('parseScheduleIntent', () => {
  it('reads every minute in Russian', () => {
    assert.deepEqual(
      parseScheduleIntent('делай обновление каждую минуту'),
      { everyMinutes: 1 },
    );
    assert.deepEqual(parseScheduleIntent('запускай раз в минуту'), {
      everyMinutes: 1,
    });
    assert.deepEqual(parseScheduleIntent('обновляй каждую 1 минуту'), {
      everyMinutes: 1,
    });
  });

  it('reads every N minutes or hours', () => {
    assert.deepEqual(parseScheduleIntent('проверяй каждые 5 минут'), {
      everyMinutes: 5,
    });
    assert.deepEqual(parseScheduleIntent('каждые 2 часа присылай отчёт'), {
      everyMinutes: 120,
    });
    assert.deepEqual(parseScheduleIntent('каждый час'), {
      everyMinutes: 60,
    });
  });

  it('reads a daily clock time', () => {
    assert.deepEqual(
      parseScheduleIntent('каждое утро в 9 пришли курс'),
      { everyMinutes: 1440, at: '09:00' },
    );
    assert.deepEqual(parseScheduleIntent('ежедневно в 18:30'), {
      everyMinutes: 1440,
      at: '18:30',
    });
  });

  it('ignores unrelated minutes and 1C', () => {
    assert.equal(parseScheduleIntent('подожди минуту и найди в 1С'), null);
    assert.equal(parseScheduleIntent('создай запись в 1С'), null);
  });

  it('labels the intent', () => {
    assert.equal(scheduleIntentLabel({ everyMinutes: 1 }), 'каждую минуту');
    assert.equal(
      scheduleIntentLabel({ everyMinutes: 1440, at: '09:00' }),
      'ежедневно в 09:00',
    );
  });
});
