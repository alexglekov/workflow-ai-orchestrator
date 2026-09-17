export type ScheduleIntent = {
  everyMinutes: number;
  at?: string;
};

const padTime = (hour: number, minute: number): string =>
  `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

const asCount = (value: string): number | null => {
  const count = Number(value);

  return Number.isFinite(count) && count >= 1 ? Math.round(count) : null;
};

const atFrom = (value: unknown): string | undefined => {
  const raw = String(value ?? '').trim();
  const match = raw.match(/^(\d{1,2})[:.](\d{2})$/);

  if (!match) {
    return undefined;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour > 23 || minute > 59) {
    return undefined;
  }

  return padTime(hour, minute);
};

/** Нормализует JSON расписания от LLM или regex. */
export const clampScheduleIntent = (value: unknown): ScheduleIntent | null => {
  if (value == null || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const at = atFrom(record['at'] ?? record['time']);
  const every = Number(
    record['everyMinutes'] ?? record['minutes'] ?? record['interval'],
  );

  if (at) {
    return { everyMinutes: 1440, at };
  }

  if (!Number.isFinite(every) || every < 1) {
    return null;
  }

  return { everyMinutes: Math.min(10_080, Math.max(1, Math.round(every))) };
};

export const looksLikeSchedule = (text: string): boolean => {
  const value = text.toLowerCase();

  return (
    /(?:кажд|кажл|кжд|every|еже|раз\s*в|по\s*расписан|daily|hourly|cron)/i.test(
      value,
    ) && /час|минут|утро|вечер|день|hour|min|day/i.test(value)
  );
};

/** Достаёт интервал или ежедневное время из формулировки задачи. */
export const parseScheduleIntent = (text: string): ScheduleIntent | null => {
  const value = text.toLowerCase().replace(/\s+/g, ' ').trim();

  if (!value) {
    return null;
  }

  if (
    /кажд(?:ую|ый|ое)\s+минуту|раз\s+в\s+минуту|every\s+minute/.test(value)
  ) {
    return { everyMinutes: 1 };
  }

  const everyOne = value.match(
    /кажд(?:ую|ые|ый)\s+(\d+)\s*(минут[аыу]?|мин|час(?:а|ов)?)/,
  );

  if (everyOne) {
    const count = asCount(everyOne[1]);

    if (count) {
      return {
        everyMinutes: /час/.test(everyOne[2]) ? count * 60 : count,
      };
    }
  }

  const everyN = value.match(
    /(?:каждые|раз\s+в|every)\s+(\d+)\s*(минут[аыу]?|мин|minutes?|mins?|час(?:а|ов)?|hours?)/,
  );

  if (everyN) {
    const count = asCount(everyN[1]);

    if (count) {
      return {
        everyMinutes: /час|hour/.test(everyN[2]) ? count * 60 : count,
      };
    }
  }

  if (
    /раз\s+в\s+час|ежечасно|every\s+hour|(?:кажд|кажл|кжд)\p{L}*\s+час/u.test(
      value,
    )
  ) {
    return { everyMinutes: 60 };
  }

  const daily = value.match(
    /(?:кажд(?:ый|ое)\s+(?:день|утро|вечер)|ежедневно|по\s+расписанию|every\s+day)[^\d]{0,28}(?:в\s+)?(\d{1,2})(?:[:.](\d{2}))?/,
  );

  if (!daily) {
    return null;
  }

  let hour = Number(daily[1]);
  const minute = Number(daily[2] || '0');

  if (/вечер/.test(value) && hour > 0 && hour < 12) {
    hour += 12;
  }

  if (/утро/.test(value) && hour === 12) {
    hour = 0;
  }

  if (
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    hour > 23 ||
    minute > 59
  ) {
    return null;
  }

  return { everyMinutes: 1440, at: padTime(hour, minute) };
};

export const scheduleIntentLabel = (intent: ScheduleIntent): string => {
  if (intent.at) {
    return `ежедневно в ${intent.at}`;
  }

  if (intent.everyMinutes === 1) {
    return 'каждую минуту';
  }

  if (intent.everyMinutes === 60) {
    return 'каждый час';
  }

  if (intent.everyMinutes % 60 === 0) {
    const hours = intent.everyMinutes / 60;

    return hours === 1 ? 'каждый час' : `каждые ${hours} ч`;
  }

  return `каждые ${intent.everyMinutes} мин`;
};
