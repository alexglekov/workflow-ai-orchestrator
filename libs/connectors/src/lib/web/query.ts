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

const TASK_NOISE = [
  /(?<![\p{L}])кажд(?:ый|ое|ую)\s+(?:день|утро|час|неделю|минуту)(?![\p{L}])/giu,
  /(?<![\p{L}])(?:ежедневно|ежечасно|по расписанию)(?![\p{L}])/giu,
  /(?<![\p{L}])каждые\s+\d+\s*\p{L}*/giu,
  /(?<![\p{L}])в\s+\d{1,2}(?:[:.]\d{2})?(?:\s*(?:утра|вечера|часов|час|ч))?(?![\p{L}\d])/giu,
  /(?<![\p{L}])(?:пришли|присылай|отправь|отправляй|напиши|сообщи|скинь)[^,.;]*?(?:телеграм\p{L}*|telegram|почт\p{L}*|email|mail|excel|таблиц\p{L}*|чат\p{L}*|бот\p{L}*|сюда)(?![\p{L}])/giu,
  /(?<![\p{L}])(?:в|на)\s+(?:телеграм\p{L}*|telegram|почту|excel|таблицу|этот\s+чат|чат)(?![\p{L}])/giu,
  /(?<![\p{L}])(?:в|во)\s+интернете(?![\p{L}])/giu,
  /(?<![\p{L}])(?:найди|найти|поищи|проверь|узнай|посмотри|подскажи|нужно|надо|пожалуйста|мне)(?![\p{L}])/giu,
  /(?<![\p{L}])(?:сводк\p{L}*|отч[её]т\p{L}*)\s+о(?![\p{L}])/giu,
  /(?<![\p{L}])(?:самых|самые|самый)(?![\p{L}])/giu,
];

const DANGLING =
  /^(?:[\s,;.]|(?<![\p{L}])(?:и|а|но|же|их|его)(?![\p{L}]))+|(?:[\s,;.]|(?<![\p{L}])(?:и|а|но|же)(?![\p{L}]))+$/giu;

const MONTHS = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

const stripTaskNoise = (value: string): string =>
  TASK_NOISE.reduce((text, pattern) => text.replace(pattern, ' '), value)
    .replace(/\s*[,;]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(DANGLING, '')
    .trim();

export const isSearchDump = (value: string): boolean => {
  const text = value.trim();

  if (!text) {
    return true;
  }

  if (text.length > 180) {
    return true;
  }

  if (/источники по запросу|```|^\s*[{[]/.test(text)) {
    return true;
  }

  return (text.match(/[.!?]\s+\S/g) || []).length >= 2;
};

export const wantsFreshSearch = (text: string): boolean => {
  const year = String(new Date().getFullYear());

  return (
    /курс|цен[аыуе]|котиров|сейчас|сегодня|актуал|свеж|новост|p2p|п2п|оферт|чарт|хит[ыа]|топ\s|рейтинг|рейс|билет|перел[её]т|погод|\blive\b|\bnow\b|usdt|btc|eth/i.test(
      text,
    ) || new RegExp(`(?<!\\d)${year}(?!\\d)`).test(text)
  );
};

export const searchFreshness = (text: string): 'day' | 'week' | undefined => {
  if (!wantsFreshSearch(text)) {
    return undefined;
  }

  if (/новост|news|сегодня|сейчас/i.test(text)) {
    return 'day';
  }

  return 'week';
};

const withCurrentStamp = (query: string, now: Date): string => {
  const year = String(now.getFullYear());
  const month = MONTHS[now.getMonth()];
  const stamp = `${now.getDate()} ${month} ${year}`;
  const lower = query.toLowerCase();

  if (lower.includes(month) && query.includes(year)) {
    return query;
  }

  if (lower.includes('актуально')) {
    return `${query} ${stamp}`.replace(/\s+/g, ' ').trim();
  }

  return `${query} актуально ${stamp}`.replace(/\s+/g, ' ').trim();
};

export const shapeSearchQuery = (
  raw: unknown,
  options?: { now?: Date; stamp?: boolean; maxLength?: number },
): string => {
  const cleaned = stripTaskNoise(normalizeQuery(raw, 400));
  const fallback = normalizeQuery(raw, 400);
  const phrase = cleaned.length >= 3 ? cleaned : fallback;

  if (!phrase) {
    return typeof raw === 'string' ? raw.trim().slice(0, options?.maxLength ?? 160) : '';
  }

  const stamped =
    options?.stamp === false ||
    /p2p|п2п|оферт/i.test(phrase) ||
    !wantsFreshSearch(phrase)
      ? phrase
      : withCurrentStamp(phrase, options?.now ?? new Date());

  return cutAtWord(stamped, options?.maxLength ?? 160);
};
