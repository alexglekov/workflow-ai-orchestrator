const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'from',
  'into',
  'какой',
  'какая',
  'какие',
  'нужно',
  'надо',
  'если',
  'чтобы',
  'этот',
  'эта',
  'это',
  'для',
  'над',
  'под',
  'при',
  'без',
  'про',
  'как',
  'что',
  'или',
  'все',
  'его',
  'нее',
  'them',
]);

const FILLER =
  /^(?:пожалуйста|найди|найти|поищи|поиск|search|find|скажи|подскажи|узнай|проверь|посмотри)(?!\p{L})[\s,:-]*/iu;

const dropFiller = (value: string): string => {
  let current = value;

  for (let pass = 0; pass < 3 && FILLER.test(current); pass += 1) {
    current = current.replace(FILLER, '');
  }

  return current;
};

const meaningfulFromJson = (value: unknown, depth = 0): string[] => {
  if (depth > 3) {
    return [];
  }

  if (typeof value === 'string') {
    return value.trim() ? [value.trim()] : [];
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return [String(value)];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => meaningfulFromJson(item, depth + 1));
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const preferred = ['query', 'q', 'text', 'title', 'subject', 'name', 'inn'];

    for (const key of preferred) {
      if (record[key] !== undefined) {
        const found = meaningfulFromJson(record[key], depth + 1);

        if (found.length) {
          return found;
        }
      }
    }

    return Object.values(record).flatMap((item) =>
      meaningfulFromJson(item, depth + 1),
    );
  }

  return [];
};

const cutAtWord = (value: string, max: number): string => {
  if (value.length <= max) {
    return value;
  }

  const head = value.slice(0, max);
  const lastSpace = head.lastIndexOf(' ');

  return (lastSpace > max * 0.6 ? head.slice(0, lastSpace) : head).trim();
};

/**
 * Приводит запрос к виду, который поисковики понимают: разворачивает JSON,
 * снимает разметку и служебные слова, схлопывает пробелы и режет по длине.
 */
export const normalizeQuery = (raw: unknown, maxLength = 240): string => {
  let value = typeof raw === 'string' ? raw : '';

  if (!value && raw != null && typeof raw === 'object') {
    value = meaningfulFromJson(raw).join(' ');
  }

  value = value.trim();

  if (/^[[{]/.test(value)) {
    try {
      value = meaningfulFromJson(JSON.parse(value)).join(' ');
    } catch {
      // не JSON — работаем с исходной строкой
    }
  }

  const cleaned = value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/https?:\/\/\S+/g, (url) => {
      try {
        return new URL(url).hostname.replace(/^www\./, '');
      } catch {
        return ' ';
      }
    })
    .replace(/[«»"'`*_#>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cutAtWord(dropFiller(cleaned).trim(), maxLength);
};

export const buildQuery = (options: {
  query: string;
  site?: string;
  freshness?: string;
}): string => {
  const parts = [normalizeQuery(options.query)];
  const site = (options.site || '').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  if (site) {
    parts.push(`site:${site}`);
  }

  return parts.filter(Boolean).join(' ').trim();
};

export const queryTerms = (query: string): string[] => {
  const terms = query
    .toLowerCase()
    .replace(/site:\S+/g, ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length >= 3 && !STOP_WORDS.has(term));

  return [...new Set(terms)];
};
