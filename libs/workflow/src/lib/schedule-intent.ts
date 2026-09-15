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

    if (!count) {
      return null;
    }

    return {
      everyMinutes: /час|hour/.test(everyN[2]) ? count * 60 : count,
    };
  }

  if (/каждый\s+час|ежечасно|every\s+hour/.test(value)) {
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
