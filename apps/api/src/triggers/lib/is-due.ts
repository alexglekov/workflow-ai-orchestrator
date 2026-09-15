export const DEFAULT_SCHEDULE_TZ = 'Europe/Moscow';

export type TriggerType = 'schedule' | 'webhook' | 'mail' | 'telegram';

export const asConfig = (config: unknown): Record<string, unknown> =>
  config && typeof config === 'object'
    ? (config as Record<string, unknown>)
    : {};

export const scheduleTimeZone = (config: unknown): string => {
  const fromConfig = String(asConfig(config)['timezone'] || '').trim();

  return fromConfig || process.env['SCHEDULE_TZ'] || DEFAULT_SCHEDULE_TZ;
};

export const zonedParts = (
  date: Date,
  timeZone: string,
): { year: number; month: number; day: number; hour: number; minute: number } => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );

  return {
    year: Number(parts['year']),
    month: Number(parts['month']),
    day: Number(parts['day']),
    hour: Number(parts['hour']),
    minute: Number(parts['minute']),
  };
};

const sameZonedDay = (left: Date, right: Date, timeZone: string): boolean => {
  const a = zonedParts(left, timeZone);
  const b = zonedParts(right, timeZone);

  return a.year === b.year && a.month === b.month && a.day === b.day;
};

const minutesOfDay = (hours: number, minutes: number): number =>
  hours * 60 + minutes;

export const minutesOf = (config: unknown, type: TriggerType): number => {
  const defaults = type === 'mail' ? 2 : type === 'telegram' ? 1 : 15;
  const value = Number(asConfig(config)['everyMinutes'] || defaults);

  return Number.isFinite(value) && value >= 1 ? value : defaults;
};

export const isDue = (
  config: unknown,
  type: TriggerType,
  lastFiredAt: Date | null,
  now: Date,
): boolean => {
  const record = asConfig(config);
  const at = record['at'];
  const timeZone = scheduleTimeZone(config);

  if (typeof at === 'string' && /^\d{2}:\d{2}$/.test(at)) {
    const [hours, minutes] = at.split(':').map(Number);
    const nowParts = zonedParts(now, timeZone);

    if (
      minutesOfDay(nowParts.hour, nowParts.minute) <
      minutesOfDay(hours, minutes)
    ) {
      return false;
    }

    return !lastFiredAt || !sameZonedDay(lastFiredAt, now, timeZone);
  }

  const last = lastFiredAt?.getTime() ?? 0;

  return !last || now.getTime() - last >= minutesOf(config, type) * 60_000;
};
