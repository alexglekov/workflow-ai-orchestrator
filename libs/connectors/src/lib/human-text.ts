const HIDDEN = new Set([
  'ok',
  'html',
  'audioBase64',
  'audio',
  'contentType',
  'provider',
  'attempts',
  'degraded',
  'cached',
  'fileId',
  'path',
  'mimeType',
  'publicPath',
  'usedFileId',
  'messageId',
  'fromId',
  'toId',
  'headers',
  'connectionId',
  'chatId',
  'skipped',
  'iterate',
  'found',
  'saved',
  'json',
  'tables',
  'items',
  'messages',
  'results',
  'rows',
  'files',
  'isVoice',
  'is_voice',
  'count',
  'source',
  'warning',
  'firstId',
  'lastId',
  'lastQty',
  'bidQty',
  'askQty',
  'applied',
  'wrote',
  'notes',
  'operations',
  'updated',
  'offers',
]);

const LABELS: Record<string, string> = {
  lastPrice: 'Цена',
  price: 'Цена',
  bidPrice: 'Покупка',
  askPrice: 'Продажа',
  volume: 'Объём',
  quoteVolume: 'Оборот',
  priceChange: 'Изменение',
  priceChangePercent: 'Изменение, %',
  weightedAvgPrice: 'Средняя цена',
  openPrice: 'Открытие',
  highPrice: 'Максимум',
  lowPrice: 'Минимум',
  prevClosePrice: 'Пред. закрытие',
  closeTime: 'Время',
  openTime: 'Открытие',
  symbol: 'Пара',
  url: 'Ссылка',
  title: 'Заголовок',
  description: 'Описание',
  query: 'Запрос',
  answer: 'Ответ',
  subject: 'Тема',
  body: 'Текст',
  caption: 'Подпись',
  name: 'Имя',
  rowIndex: 'Строка',
  fileName: 'Файл',
  sheet: 'Лист',
  from: 'От',
  username: 'Кто',
  to: 'Кому',
  btcRub: 'BTC → RUB',
  ltcRub: 'LTC → RUB',
  usdtRub: 'USDT → RUB',
  rate: 'Курс',
  text: 'Текст',
  summary: 'Сводка',
  inn: 'ИНН',
  phone: 'Телефон',
  amount: 'Сумма',
  label: 'Метка',
  reason: 'Почему',
  key: 'Ключ',
  value: 'Значение',
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const looksLikeJson = (value: string): boolean => {
  const trimmed = value.trim();

  return (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  );
};

const parseJson = (value: string): unknown => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
};

const labelOf = (key: string): string => {
  if (LABELS[key]) {
    return LABELS[key];
  }

  const spaced = key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();

  return spaced ? spaced[0].toUpperCase() + spaced.slice(1) : key;
};

const formatScalar = (key: string, value: unknown): string => {
  if (typeof value === 'boolean') {
    return value ? 'да' : 'нет';
  }

  if (typeof value === 'number') {
    if (/time$/i.test(key) && value > 1e11) {
      return new Date(value).toLocaleString('ru-RU');
    }

    if (/percent$/i.test(key)) {
      return `${value}%`;
    }

    return String(value);
  }

  const text = String(value).trim();

  if (!text) {
    return '';
  }

  if (/percent$/i.test(key) && /^-?\d/.test(text) && !text.includes('%')) {
    return `${text}%`;
  }

  if (/time$/i.test(key) && /^\d{12,13}$/.test(text)) {
    return new Date(Number(text)).toLocaleString('ru-RU');
  }

  return text;
};

const formatTable = (table: unknown): string => {
  if (!Array.isArray(table)) {
    return '';
  }

  return table
    .map((row) =>
      Array.isArray(row)
        ? row.map((cell) => String(cell ?? '').trim()).filter(Boolean).join(' · ')
        : String(row ?? '').trim(),
    )
    .filter(Boolean)
    .join('\n');
};

export const isJsonDump = (value: string): boolean => {
  const trimmed = value.trim();

  if (!looksLikeJson(trimmed)) {
    return false;
  }

  return parseJson(trimmed) !== undefined;
};

export const humanText = (value: unknown, depth = 0): string => {
  if (value == null) {
    return '';
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (!trimmed) {
      return '';
    }

    if (depth < 4 && looksLikeJson(trimmed)) {
      const parsed = parseJson(trimmed);

      if (parsed !== undefined) {
        return humanText(parsed, depth + 1) || trimmed;
      }
    }

    return trimmed;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return formatScalar('', value);
  }

  if (depth > 5) {
    return '';
  }

  if (Array.isArray(value)) {
    return value
      .map((item, index) => {
        const line = humanText(item, depth + 1);

        if (!line) {
          return '';
        }

        if (typeof item === 'object' && item && !Array.isArray(item)) {
          return value.length > 1 ? `${index + 1}. ${line}` : line;
        }

        return line;
      })
      .filter(Boolean)
      .join('\n');
  }

  const record = asRecord(value);

  if (record['skipped'] === true) {
    return '';
  }

  const listed =
    record['items'] ??
    record['messages'] ??
    record['rows'] ??
    record['files'];

  if (Array.isArray(listed)) {
    if (Array.isArray(record['rows']) && listed === record['rows']) {
      const prose = ['answer', 'text']
        .map((key) => record[key])
        .find(
          (item): item is string =>
            typeof item === 'string' &&
            item.trim().length > 0 &&
            !isJsonDump(item),
        );

      if (prose) {
        return prose.trim();
      }
    }

    const lines = listed
      .map((item) => humanText(item, depth + 1))
      .filter(Boolean);

    if (lines.length) {
      return lines.join('\n');
    }

    if (Array.isArray(record['rows'])) {
      return 'В таблице нет таких строк';
    }

    if (Array.isArray(record['files'])) {
      return 'На Диске нет таблиц';
    }

    if (record['source'] === 'event' || record['count'] === 0) {
      return '';
    }

    return 'Нет входящих сообщений';
  }

  const who = [record['username'], record['from'], record['name']]
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .find(Boolean);
  const prose = ['answer', 'text', 'subject', 'body', 'caption']
    .map((key) => record[key])
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .find(Boolean);

  if (record['isVoice'] === true || record['is_voice'] === true) {
    return who ? `${who}: голосовое сообщение` : 'Голосовое сообщение';
  }

  const parts: string[] = [];

  if (prose && !isJsonDump(prose)) {
    parts.push(who && who !== prose ? `${who}: ${prose}` : prose);
  } else if (prose && isJsonDump(prose)) {
    const nested = humanText(parseJson(prose), depth + 1);

    if (nested) {
      parts.push(nested);
    }
  } else if (record['json'] != null) {
    const nested = humanText(record['json'], depth + 1);

    if (nested) {
      parts.push(nested);
    }
  }

  if (Array.isArray(record['tables'])) {
    const tables = record['tables']
      .map((table) => formatTable(table))
      .filter(Boolean);

    if (tables.length) {
      parts.push(tables.join('\n\n'));
    }
  }

  if (typeof record['warning'] === 'string' && record['warning'].trim()) {
    parts.push(record['warning'].trim());
  }

  for (const [key, nested] of Object.entries(record)) {
    if (HIDDEN.has(key) || nested == null || nested === '') {
      continue;
    }

    if (
      key === 'text' ||
      key === 'answer' ||
      key === 'subject' ||
      key === 'body' ||
      key === 'caption' ||
      key === 'username' ||
      key === 'from' ||
      key === 'name'
    ) {
      continue;
    }

    if (key === 'sent' && nested === true) {
      if (!parts.length) {
        parts.push('Отправлено');
      }

      continue;
    }

    const formatted =
      typeof nested === 'object'
        ? humanText(nested, depth + 1)
        : formatScalar(key, nested);

    if (!formatted) {
      continue;
    }

    if (formatted.includes('\n')) {
      parts.push(`${labelOf(key)}:\n${formatted}`);
    } else {
      parts.push(`${labelOf(key)}: ${formatted}`);
    }
  }

  if (parts.length) {
    return [...new Set(parts)].join('\n');
  }

  if (record['sent'] === true) {
    return 'Отправлено';
  }

  if (record['source'] === 'event' || record['count'] === 0) {
    return '';
  }

  return '';
};

const NOISE_REPLY = /^(ok|true|false|готово\.?|отправлено\.?)$/i;

export const isThinReply = (value: string): boolean => {
  const text = value.trim();

  if (!text || NOISE_REPLY.test(text) || text.length < 24) {
    return true;
  }

  return !text.includes('\n') && text.length < 160 && /:$/.test(text);
};

const pickReply = (value: unknown): string => {
  if (value == null) {
    return '';
  }

  const record = asRecord(value);
  const prose = ['text', 'answer', 'summary', 'body', 'caption']
    .map((key) => record[key])
    .find(
      (item): item is string =>
        typeof item === 'string' && item.trim().length > 0 && !isJsonDump(item),
    );

  if (prose) {
    return prose.trim();
  }

  const text = humanText(value).trim();

  if (!text || text.length < 12 || NOISE_REPLY.test(text)) {
    return '';
  }

  return text;
};

export const runReplyText = (
  steps: Array<{
    connectorId: string;
    action: string;
    status?: string;
    output?: unknown;
    input?: unknown;
  }>,
): string => {
  const ok = steps.filter(
    (step) => !step.status || step.status === 'success',
  );

  const prefer = [
    (step: (typeof ok)[number]) =>
      step.connectorId === 'llm' &&
      (step.action === 'generate' || step.action === 'extract'),
    (step: (typeof ok)[number]) =>
      step.connectorId === 'excel' && step.action === 'apply',
    (step: (typeof ok)[number]) =>
      step.connectorId === 'transform' &&
      (step.action === 'template' || step.action === 'join'),
    (step: (typeof ok)[number]) =>
      step.action === 'send_message' ||
      (step.connectorId === 'mail' && step.action === 'send'),
  ];

  for (const match of prefer) {
    for (const step of [...ok].reverse()) {
      if (!match(step)) {
        continue;
      }

      const text =
        pickReply(step.output) ||
        (step.action === 'send_message' || step.action === 'send'
          ? pickReply(step.input)
          : '');

      if (text && !isThinReply(text)) {
        return text;
      }
    }
  }

  for (const step of [...ok].reverse()) {
    if (step.connectorId === 'web') {
      continue;
    }

    if (step.connectorId === 'browser') {
      continue;
    }

    const text = pickReply(step.output);

    if (text && !isThinReply(text)) {
      return text;
    }
  }

  const last = pickReply(ok.at(-1)?.output);

  return last && !isThinReply(last) ? last : '';
};
