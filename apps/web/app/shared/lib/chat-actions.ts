export const TELEGRAM_CONNECT_MARK = '[[connect_telegram]]';
export const LAUNCH_MARK = '[[launch]]';
export const STATUS_LAUNCHED_MARK = '[[status:launched]]';
export const STATUS_STOPPED_MARK = '[[status:stopped]]';

export const OPTIONAL_CONNECTORS = new Set([
  'web',
  'browser',
  'llm',
  'transform',
  'memory',
]);

export const connectMark = (connectorId: string) => `[[connect:${connectorId}]]`;

export const runMark = (runId: string) => `[[run:${runId}]]`;

export const connectedStatusMark = (connectorId: string) =>
  `[[status:connected:${connectorId}]]`;

export const launchedStatusMessage = (runId?: string) =>
  [`Запущено.`, STATUS_LAUNCHED_MARK, runId ? runMark(runId) : '']
    .filter(Boolean)
    .join('\n');

export const stoppedStatusMessage = () => `Остановлено.\n${STATUS_STOPPED_MARK}`;

export const connectedStatusMessage = (connectorId: string, title?: string) => {
  if (connectorId === 'mail') {
    return `Почта подключена.\n${connectedStatusMark(connectorId)}`;
  }

  if (connectorId === 'telegram') {
    return `Telegram подключён.\n${connectedStatusMark(connectorId)}`;
  }

  return `${title || connectorId} подключён.\n${connectedStatusMark(connectorId)}`;
};

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

export const stripChatMarks = (text: string) =>
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

export const parseChatActions = (content: string) => {
  const connect = [
    ...content.matchAll(/\[\[connect:([a-z0-9_]+)\]\]/gi),
  ].map((match) => match[1]);

  if (content.includes(TELEGRAM_CONNECT_MARK) && !connect.includes('telegram')) {
    connect.push('telegram');
  }

  const run = content.match(/\[\[run:([a-z0-9-]+)\]\]/i);
  const connected = content.match(/\[\[status:connected:([a-z0-9_]+)\]\]/i);

  return {
    text: stripChatMarks(content),
    connect: [...new Set(connect)],
    launch: content.includes(LAUNCH_MARK),
    runId: run?.[1] ?? null,
    status: content.includes(STATUS_LAUNCHED_MARK)
      ? ('launched' as const)
      : content.includes(STATUS_STOPPED_MARK)
        ? ('stopped' as const)
        : connected
          ? ('connected' as const)
          : null,
    statusConnector: connected?.[1] ?? null,
  };
};

export const isStopIntent = (text: string) => {
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

export const isLaunchIntent = (text: string) => {
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

export const connectIntentId = (text: string): string | null => {
  const value = text.trim().toLowerCase();

  if (/телеграм|telegram/.test(value) && /подключ/.test(value)) {
    return 'telegram';
  }

  if (/почт|mail|imap|gmail/.test(value) && /подключ/.test(value)) {
    return 'mail';
  }

  if (/excel|таблиц|яндекс.?диск|google.?drive/.test(value) && /подключ/.test(value)) {
    return 'excel';
  }

  if (/1с|1c|onec/.test(value) && /подключ/.test(value)) {
    return 'onec';
  }

  return null;
};

export const connectorTitle = (id: string, name?: string) => {
  if (id === 'mail') {
    return 'Почту';
  }

  if (id === 'telegram') {
    return 'Telegram';
  }

  if (id === 'excel') {
    return 'Excel';
  }

  if (id === 'onec') {
    return '1С';
  }

  return name || id;
};
