import type { ParsedStep } from './types';

export type PlanCatalogAction = {
  id: string;
  name: string;
  description?: string;
};

export type PlanCatalogConnector = {
  id: string;
  name: string;
  description?: string;
  actions: PlanCatalogAction[];
};

const PIPELINE = [
  'mail.fetch_new',
  'web.search',
  'web.fetch',
  'excel.find_file',
  'excel.read_rows',
  'onec.create_record',
  'excel.append_row',
  'mail.send',
  'telegram.send_message',
];

const ACTION_HINTS: Record<string, string> = {
  'mail.fetch_new':
    'входящие непрочитанные проверить почту inbox imap получить письма заявки новые письма',
  'mail.send':
    'отправить письмо исходящее smtp получателю email',
  'web.search':
    'найди поиск google гугл инн inn курс bestchange справка реквизит',
  'web.fetch': 'открой страницу сайт url скачать http https',
  'excel.find_file': 'найди файл диск drive яндекс google xlsx',
  'excel.read_rows': 'прочитай прочитать строки лист таблицу excel',
  'excel.append_row': 'добавь допиши запиши строку в таблицу excel',
  'onec.create_record': 'создай запись 1с onec crm лид задачу',
  'telegram.send_message': 'телеграм telegram уведомление сообщение бот',
};

const CONNECTOR_HINTS: Record<string, string> = {
  mail: 'почта mail email письмо smtp imap',
  web: 'сайт веб web инн inn http https курс bestchange справочн гугл',
  excel: 'excel эксель таблица xlsx диск',
  onec: '1с 1c onec',
  telegram: 'телеграм telegram',
};

const LIST_PRODUCERS = new Set(['mail.fetch_new', 'excel.read_rows']);

const tokenize = (value: string): string[] =>
  value.toLowerCase().match(/[a-zа-яё0-9]{2,}/gi) ?? [];

const includesHint = (prompt: string, hints: string): number => {
  const text = prompt.toLowerCase();
  let hits = 0;

  for (const hint of tokenize(hints)) {
    const latinShort = hint.length <= 4 && /^[a-z0-9]+$/i.test(hint);
    const matched = latinShort
      ? new RegExp(`(^|[^a-z0-9])${hint}([^a-z0-9]|$)`, 'i').test(text)
      : text.includes(hint) ||
        (hint.length >= 4 && text.includes(hint.slice(0, 4)));

    if (matched) {
      hits += 1;
    }
  }

  return hits;
};

const scoreAction = (
  prompt: string,
  connector: PlanCatalogConnector,
  action: PlanCatalogAction,
): number => {
  const key = `${connector.id}.${action.id}`;
  const connectorHit = includesHint(
    prompt,
    [connector.id, connector.name, CONNECTOR_HINTS[connector.id] || ''].join(
      ' ',
    ),
  );
  const actionHit = includesHint(
    prompt,
    [action.id, action.name, ACTION_HINTS[key] || ''].join(' '),
  );

  if (connectorHit === 0 && actionHit === 0) {
    return 0;
  }

  if (connectorHit === 0) {
    return actionHit;
  }

  return connectorHit + actionHit * 3;
};

const firstUrl = (prompt: string): string =>
  (prompt.match(/https?:\/\/[^\s)\]>'"]+/i)?.[0] || '').replace(/[.,;]+$/u, '');

const isExcelUrl = (url: string): boolean =>
  /xlsx|docs\.google|drive\.google|disk\.yandex|yadi\.sk/i.test(url);

const firstEmail = (prompt: string): string =>
  prompt.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';

const excelFileName = (prompt: string): string =>
  prompt.match(/["«]([^"»]+\.xlsx?)["»]/i)?.[1] ||
  prompt.match(/\b([\w.-]+\.xlsx?)\b/i)?.[1] ||
  '';

const fillParams = (
  connectorId: string,
  actionId: string,
  prompt: string,
  selected: Array<{ connectorId: string; action: string }>,
): Record<string, unknown> => {
  const url = firstUrl(prompt);
  const fileName = excelFileName(prompt);
  const email = firstEmail(prompt);
  const hasSearch = selected.some(
    (step) => step.connectorId === 'web' && step.action === 'search',
  );

  if (connectorId === 'mail' && actionId === 'fetch_new') {
    const subject = prompt.match(/тем[аеуы]\s*[:«"']?([^"»\n,]+)/i)?.[1];

    return {
      limit: 5,
      ...(subject ? { subjectContains: subject.trim() } : {}),
    };
  }

  if (connectorId === 'mail' && actionId === 'send') {
    return {
      ...(email ? { to: email } : {}),
      subject: prompt.match(/тем[аеуы]\s*[:«"']?([^"»\n,]+)/i)?.[1]?.trim() ||
        prompt.slice(0, 80),
      text: '{{previous}}',
    };
  }

  if (connectorId === 'web' && actionId === 'search') {
    return { query: prompt.trim().slice(0, 220), limit: 5 };
  }

  if (connectorId === 'web' && actionId === 'fetch') {
    if (url && !isExcelUrl(url)) {
      return { url };
    }

    if (hasSearch) {
      return { url: '{{previous.results.0.url}}' };
    }

    return url ? { url } : {};
  }

  if (connectorId === 'excel') {
    const params: Record<string, unknown> = {};

    if (url && isExcelUrl(url)) {
      params['fileUrl'] = url;
    }

    if (fileName) {
      params['fileName'] = fileName;
    }

    return params;
  }

  if (connectorId === 'telegram' && actionId === 'send_message') {
    return {
      text: 'Результат: {{previous}}',
    };
  }

  return {};
};

const pipelineIndex = (connectorId: string, actionId: string): number => {
  const index = PIPELINE.indexOf(`${connectorId}.${actionId}`);

  return index === -1 ? PIPELINE.length : index;
};

export const planFromCatalog = (
  prompt: string,
  catalog: PlanCatalogConnector[],
): ParsedStep[] => {
  const text = prompt.trim();

  if (!text || catalog.length === 0) {
    return [];
  }

  const scored = catalog.flatMap((connector) =>
    connector.actions.map((action) => ({
      connector,
      action,
      score: scoreAction(text, connector, action),
    })),
  );

  const max = Math.max(0, ...scored.map((item) => item.score));
  const threshold = Math.max(4, max - 3);
  const unique: typeof scored = [];

  for (const connector of catalog) {
    const actions = scored
      .filter((item) => item.connector.id === connector.id)
      .sort((left, right) => right.score - left.score);
    const mentioned =
      includesHint(
        text,
        [connector.id, connector.name, CONNECTOR_HINTS[connector.id] || ''].join(
          ' ',
        ),
      ) > 0;
    const passing = actions.filter(
      (item) => item.score >= threshold && item.score >= 3,
    );

    if (passing.length > 0) {
      unique.push(...passing);
      continue;
    }

    if (mentioned && actions[0] && actions[0].score > 0) {
      unique.push(actions[0]);
    }
  }

  const hasIncomingMail = includesHint(
    text,
    'входящие непрочитанные проверить inbox заявки получить новые',
  );
  const hasOutgoingMail =
    includesHint(text, 'отправить исходящее получателю smtp') > 0 ||
    Boolean(firstEmail(text));

  if (hasOutgoingMail && !hasIncomingMail) {
    const filtered = unique.filter(
      (item) => !(item.connector.id === 'mail' && item.action.id === 'fetch_new'),
    );
    unique.length = 0;
    unique.push(...filtered);
  }

  if (hasIncomingMail && !hasOutgoingMail) {
    const filtered = unique.filter(
      (item) => !(item.connector.id === 'mail' && item.action.id === 'send'),
    );
    unique.length = 0;
    unique.push(...filtered);
  }

  const webUrl = firstUrl(text);

  const webConnector = catalog.find((connector) => connector.id === 'web');
  const ensureWebAction = (
    list: typeof unique,
    actionId: string,
  ): typeof unique => {
    if (list.some((item) => item.connector.id === 'web' && item.action.id === actionId)) {
      return list;
    }

    const action = webConnector?.actions.find((item) => item.id === actionId);

    if (!webConnector || !action) {
      return list;
    }

    return [...list, { connector: webConnector, action, score: threshold }];
  };

  let withFetch = unique;

  if (
    unique.some((item) => item.connector.id === 'web' && item.action.id === 'search')
  ) {
    withFetch = ensureWebAction(withFetch, 'fetch');
  }

  if (webUrl && !isExcelUrl(webUrl)) {
    withFetch = ensureWebAction(withFetch, 'fetch');
  }

  const ordered = [...withFetch].sort(
    (left, right) =>
      pipelineIndex(left.connector.id, left.action.id) -
      pipelineIndex(right.connector.id, right.action.id),
  );

  const selected = ordered.map((item) => ({
    connectorId: item.connector.id,
    action: item.action.id,
  }));
  const hasList = selected.some((step) =>
    LIST_PRODUCERS.has(`${step.connectorId}.${step.action}`),
  );

  return ordered.slice(0, 8).map((item) => {
    const key = `${item.connector.id}.${item.action.id}`;

    return {
      title: item.action.name || key,
      connectorId: item.connector.id,
      action: item.action.id,
      params: fillParams(item.connector.id, item.action.id, text, selected),
      iterate: hasList && !LIST_PRODUCERS.has(key) && item.action.id !== 'search',
    };
  });
};
