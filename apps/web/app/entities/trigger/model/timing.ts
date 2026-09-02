export const TIMEZONES = [
  { id: 'Europe/Moscow', label: 'Москва' },
  { id: 'Europe/Kaliningrad', label: 'Калининград' },
  { id: 'Europe/Samara', label: 'Самара' },
  { id: 'Asia/Yekaterinburg', label: 'Екатеринбург' },
  { id: 'Asia/Novosibirsk', label: 'Новосибирск' },
  { id: 'Asia/Vladivostok', label: 'Владивосток' },
  { id: 'UTC', label: 'UTC' },
] as const;

export const DEFAULT_TIMEZONE = 'Europe/Moscow';

export const INTERVAL_OPTIONS = [
  { minutes: 1, label: 'Каждую минуту' },
  { minutes: 2, label: 'Каждые 2 минуты' },
  { minutes: 5, label: 'Каждые 5 минут' },
  { minutes: 15, label: 'Каждые 15 минут' },
  { minutes: 30, label: 'Каждые 30 минут' },
  { minutes: 60, label: 'Каждый час' },
  { minutes: 360, label: 'Каждые 6 часов' },
] as const;

export const defaultMinutesFor = (type: string) => {
  if (type === 'mail') {
    return 2;
  }

  if (type === 'telegram') {
    return 1;
  }

  return 15;
};

export const triggerAt = (trigger: { config: Record<string, unknown> }) => {
  const value = trigger.config['at'];

  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value)
    ? value
    : '';
};

export const triggerTimezone = (trigger: {
  config: Record<string, unknown>;
}) => {
  const value = trigger.config['timezone'];

  return typeof value === 'string' && value.trim()
    ? value.trim()
    : DEFAULT_TIMEZONE;
};

export const triggerMinutes = (
  trigger: { type: string; config: Record<string, unknown> },
) => {
  const value = Number(trigger.config['everyMinutes']);

  return Number.isFinite(value) && value >= 1
    ? value
    : defaultMinutesFor(trigger.type);
};

export const timingLabel = (
  everyMinutes: number,
  at?: string,
  timezone?: string,
) => {
  if (at) {
    const zone = TIMEZONES.find((item) => item.id === timezone);

    return zone ? `ежедневно в ${at} (${zone.label})` : `ежедневно в ${at}`;
  }

  const found = INTERVAL_OPTIONS.find((item) => item.minutes === everyMinutes);

  return found
    ? found.label.toLowerCase()
    : `каждые ${everyMinutes} мин`;
};
