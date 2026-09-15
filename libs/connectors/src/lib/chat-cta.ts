export const TELEGRAM_CONNECT_MARK = '[[connect_telegram]]';
export const LAUNCH_MARK = '[[launch]]';
export const STATUS_LAUNCHED_MARK = '[[status:launched]]';
export const STATUS_STOPPED_MARK = '[[status:stopped]]';

export const connectedStatusMark = (connectorId: string): string =>
  `[[status:connected:${connectorId}]]`;

export const OPTIONAL_CONNECTORS = new Set([
  'web',
  'browser',
  'llm',
  'transform',
  'memory',
]);

export const connectMark = (connectorId: string): string =>
  `[[connect:${connectorId}]]`;

export const runMark = (runId: string): string => `[[run:${runId}]]`;

export const requiredConnectorIds = (
  steps: Array<{ connectorId: string }>,
): string[] => [
  ...new Set(
    steps
      .map((step) => step.connectorId)
      .filter((id) => id && !OPTIONAL_CONNECTORS.has(id)),
  ),
];

export const missingConnectorIds = (
  required: string[],
  connections: Array<{ connectorId: string; status: string }>,
): string[] =>
  required.filter(
    (id) =>
      !connections.some(
        (item) => item.connectorId === id && item.status === 'connected',
      ),
  );

export const unresolvedConnectorIds = (
  steps: Array<{ connectorId: string; connectionId?: string | null }>,
  connections: Array<{ id: string; connectorId: string; status: string }>,
): string[] => {
  const connected = new Map(
    connections
      .filter((item) => item.status === 'connected')
      .map((item) => [item.id, item]),
  );

  return requiredConnectorIds(steps).filter((id) => {
    const bound = steps.filter((step) => step.connectorId === id);

    return (
      !bound.length ||
      !bound.every((step) => {
        const connection = step.connectionId
          ? connected.get(step.connectionId)
          : undefined;

        return connection?.connectorId === id;
      })
    );
  });
};

export const stripChatMarks = (text: string): string =>
  text
    .replace(/\[\[connect:[a-z0-9_]+\]\]/gi, '')
    .split(TELEGRAM_CONNECT_MARK)
    .join('')
    .split(LAUNCH_MARK)
    .join('')
    .replace(/\[\[status:connected:[a-z0-9_]+\]\]/gi, '')
    .split(STATUS_LAUNCHED_MARK)
    .join('')
    .split(STATUS_STOPPED_MARK)
    .join('')
    .replace(/\[\[run:[a-z0-9-]+\]\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

export const launchedStatusMessage = (runId?: string): string =>
  [`Запущено.`, STATUS_LAUNCHED_MARK, runId ? runMark(runId) : '']
    .filter(Boolean)
    .join('\n');

export const stoppedStatusMessage = (): string =>
  `Остановлено.\n${STATUS_STOPPED_MARK}`;

export const connectedStatusMessage = (
  connectorId: string,
  title: string,
): string => {
  const noun =
    connectorId === 'mail'
      ? 'Почта подключена.'
      : connectorId === 'telegram'
        ? 'Telegram подключён.'
        : `${title} подключён.`;

  return `${noun}\n${connectedStatusMark(connectorId)}`;
};

export const withReadyCta = (
  message: string,
  missing: string[],
  canLaunch: boolean,
): string => {
  if (
    message.includes(STATUS_STOPPED_MARK) ||
    message.includes(STATUS_LAUNCHED_MARK) ||
    /бот остановлен|^остановлено\.?$/im.test(message)
  ) {
    return message;
  }

  let next = stripChatMarks(message);

  if (missing.length) {
    if (!/подключ/i.test(next)) {
        next = `${next}\n\nЧтобы запустить, в чате выберите существующее подключение или создайте новое.`;
    }

    for (const id of missing) {
      const mark = connectMark(id);

      if (!next.includes(mark) && !(id === 'telegram' && next.includes(TELEGRAM_CONNECT_MARK))) {
        next = `${next}\n${mark}`;
      }
    }

    return next;
  }

  if (canLaunch) {
    if (!next.includes(LAUNCH_MARK)) {
      if (!/запуст/i.test(next)) {
        next = `${next}\n\nВсё подключено. Можно запускать.`;
      }

      next = `${next}\n${LAUNCH_MARK}`;
    }

    return next;
  }

  return next;
};

export const withTelegramConnectCta = (message: string): string =>
  withReadyCta(message, ['telegram'], false);

export const isStopIntent = (text: string): boolean => {
  const value = text.trim().toLowerCase();

  if (
    /^(останови(?:ть|те)?|стоп|stop|выключи(?:ть)?|отключи(?:ть)?)(?:\s|$|[.,!?])/i.test(
      value,
    )
  ) {
    return true;
  }

  return (
    value.length <= 80 &&
    /останов/.test(value) &&
    /бот|сценари|запуск|workflow/.test(value)
  );
};

export const isLaunchIntent = (text: string): boolean => {
  const value = text.trim().toLowerCase();

  if (isStopIntent(value)) {
    return false;
  }

  if (
    /^(запусти(?:ть|ай)?|запуск|начинай|начни(?:м|те)?|начнём|начнем|включи(?:ть)?|включай|поехали|старт|start|run|go)(?:\s|$|[.,!?])/i.test(
      value,
    )
  ) {
    return true;
  }

  return (
    value.length <= 80 &&
    /(запуст|начн|включ|поехал|старт|start|\brun\b)/.test(value) &&
    /бот|сценари|слуша|работ|workflow/.test(value)
  );
};
