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

export const isDoItTask = (text: string) => {
  const value = text.trim();

  if (!value || isStopIntent(value) || isLaunchIntent(value)) {
    return false;
  }

  if (
    /(добавь|убери|удали|поменяй|замени|измени)\s+(шаг|фильтр|триггер|подключен)/i.test(
      value,
    )
  ) {
    return false;
  }

  if (
    /(?:сделай|создай|собери)\s+(?:мне\s+)?(?:бота|сценари|workflow|цепочк)/i.test(
      value,
    ) &&
    !/(отч[её]т|найд|пришл|отправ)/i.test(value)
  ) {
    return false;
  }

  return /(найд|поищ|пришл|отправ|сообщ|собери|сделай|узнай|прогон|сравни|подбер|проверь|разбер)/i.test(
    value,
  );
};

export const isRunNowIntent = (text: string, hasSteps = false) => {
  const value = text.trim().toLowerCase();

  if (!value || isStopIntent(value)) {
    return false;
  }

  if (
    /(?:сделай|создай|собери)\s+(?:мне\s+)?(?:бота|сценари|workflow|цепочк)/i.test(
      value,
    ) &&
    !/отч[её]т/.test(value)
  ) {
    return false;
  }

  const ignoreTimer =
    /не\s*взирая|невзирая|не\s*смотря\s+на|не\s*дожида?|не\s*жди|не\s*ждать|прямо\s+сейчас|немедленн|вне\s+(?:очереди|расписан)|разово(?:\s|$)|не\s+по\s+таймеру/i.test(
      value,
    ) ||
    (/сейчас/i.test(value) &&
      /(сделай|собери|пришли|отправь|скинь|прогони|запусти|выполн|отч[её]т)/i.test(
        value,
      ));
  const wantsOutput =
    /(сделай|собери|пришли|отправь|скинь|подготовь|прогони|запусти|выполн)/i.test(
      value,
    ) || /отч[её]т|результат|сводк/.test(value);

  if (ignoreTimer && wantsOutput) {
    return true;
  }

  const asksReport =
    /(сделай|собери|пришли|отправь|скинь|подготовь)\s+(?:мне\s+)?(?:этот\s+|текущий\s+)?(?:отч[её]т|результат|сводк)/i.test(
      value,
    );
  const setsSchedule =
    /кажд(?:ый|ую|ое|ые)|ежечас|по\s+расписанию|утром\s+в|каждые\s+\d/i.test(
      value,
    );

  return hasSteps && asksReport && !setsSchedule;
};

export const connectIntentId = (text: string): string | null => {
  const value = text.trim().toLowerCase();

  if (/телеграм|telegram/.test(value) && /подключ/.test(value)) {
    return 'telegram';
  }

  if (/почт|mail|imap|gmail/.test(value) && /подключ/.test(value)) {
    return 'mail';
  }

  if (
    /excel|таблиц|яндекс.?диск|яндекс.?таблиц|google.?drive|google.?sheets/.test(
      value,
    ) &&
    /подключ/.test(value)
  ) {
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
    return 'Excel / Яндекс Таблицы';
  }

  if (id === 'onec') {
    return '1С';
  }

  return name || id;
};
