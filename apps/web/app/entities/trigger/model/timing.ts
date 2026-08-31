export const INTERVAL_OPTIONS = [
  { minutes: 1, label: 'Каждую минуту' },
  { minutes: 2, label: 'Каждые 2 минуты' },
  { minutes: 5, label: 'Каждые 5 минут' },
  { minutes: 15, label: 'Каждые 15 минут' },
  { minutes: 30, label: 'Каждые 30 минут' },
  { minutes: 60, label: 'Каждый час' },
  { minutes: 360, label: 'Каждые 6 часов' },
] as const;

export const defaultMinutesFor = (type: string) =>
  type === 'mail' ? 2 : 15;

export const triggerAt = (trigger: { config: Record<string, unknown> }) => {
  const value = trigger.config['at'];

  return typeof value === 'string' && /^\d{2}:\d{2}$/.test(value)
    ? value
    : '';
};

export const triggerMinutes = (
  trigger: { type: string; config: Record<string, unknown> },
) => {
  const value = Number(trigger.config['everyMinutes']);

  return Number.isFinite(value) && value >= 1
    ? value
    : defaultMinutesFor(trigger.type);
};

export const timingLabel = (everyMinutes: number, at?: string) => {
  if (at) {
    return `ежедневно в ${at}`;
  }

  const found = INTERVAL_OPTIONS.find((item) => item.minutes === everyMinutes);

  return found
    ? found.label.toLowerCase()
    : `каждые ${everyMinutes} мин`;
};
