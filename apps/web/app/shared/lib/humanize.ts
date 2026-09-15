const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
};

export const humanizeOutput = (value: unknown, depth = 0): string => {
  if (value == null) {
    return '';
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return humanizeOutput(JSON.parse(trimmed), depth + 1);
      } catch {
        return trimmed;
      }
    }

    return trimmed;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (depth > 4) {
    return '';
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => humanizeOutput(item, depth + 1))
      .filter(Boolean)
      .join('\n');
  }

  const record = asRecord(value);

  if (record['skipped'] === true) {
    return '';
  }

  const items = record['items'] ?? record['messages'];
  const listed = Array.isArray(items);

  if (listed) {
    const lines = items
      .map((item) => humanizeOutput(item, depth + 1))
      .filter(Boolean);

    if (lines.length) {
      return lines.join('\n');
    }

    return 'Нет входящих сообщений';
  }

  const text = firstText(
    record['text'],
    record['answer'],
    record['subject'],
    record['body'],
    record['caption'],
  );
  const who = firstText(record['username'], record['from'], record['name']);

  if (text && who && who !== text) {
    return `${who}: ${text}`;
  }

  if (text) {
    return text;
  }

  if (record['isVoice'] === true) {
    return who ? `${who}: голосовое сообщение` : 'Голосовое сообщение';
  }

  if (record['sent'] === true) {
    return 'Отправлено';
  }

  if (record['source'] === 'event' || record['count'] === 0) {
    return 'Нет входящих сообщений';
  }

  return '';
};
