/**
 * Этап 2 — точный парсинг. Модель видит очищенный текст/таблицы страницы и
 * возвращает JSON по схеме. Но LLM часто отдаёт числа «как на странице»:
 * «95,50 ₽», «1 234,5», «12%». Здесь мы детерминированно приводим ответ к
 * типам из схемы, чтобы дальше по воркфлоу шли настоящие числа, а не строки.
 */

/**
 * Разбирает число из «человеческой» строки: убирает валютные символы, единицы,
 * пробелы-разделители тысяч (в т. ч. неразрывные) и понимает запятую как
 * десятичный разделитель (RU-формат).
 */
export const parseNumberLike = (raw: unknown): number | null => {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }

  if (typeof raw !== 'string') {
    return null;
  }

  // Оставляем только цифры, разделители и знак. Пробелы (обычные и NBSP) — прочь.
  const cleaned = raw
    .replace(/[\s\u00a0\u202f]/g, '')
    .replace(/[^0-9.,-]/g, '');

  if (!/[0-9]/.test(cleaned)) {
    return null;
  }

  const sign = cleaned.startsWith('-') ? -1 : 1;
  const digits = cleaned.replace(/-/g, '');
  const hasComma = digits.includes(',');
  const hasDot = digits.includes('.');
  let normalized = digits;

  if (hasComma && hasDot) {
    // Десятичный разделитель — тот, что стоит правее; остальное это тысячи.
    const decimal = digits.lastIndexOf(',') > digits.lastIndexOf('.') ? ',' : '.';
    const thousands = decimal === ',' ? '.' : ',';

    normalized = digits
      .split(thousands)
      .join('')
      .replace(decimal, '.');
  } else if (hasComma) {
    // Несколько запятых — это разделители тысяч, одна — десятичная (RU).
    normalized =
      (digits.match(/,/g) || []).length > 1
        ? digits.replace(/,/g, '')
        : digits.replace(',', '.');
  } else if (hasDot && (digits.match(/\./g) || []).length > 1) {
    // «1.234.567» — точки как тысячи.
    normalized = digits.replace(/\./g, '');
  }

  const value = Number(normalized);

  return Number.isFinite(value) ? sign * value : null;
};

const parseBooleanLike = (raw: unknown): boolean | null => {
  if (typeof raw === 'boolean') {
    return raw;
  }

  if (typeof raw === 'number') {
    return raw !== 0;
  }

  if (typeof raw !== 'string') {
    return null;
  }

  const value = raw.trim().toLowerCase();

  if (/^(true|да|yes|1|y|истина)$/.test(value)) {
    return true;
  }

  if (/^(false|нет|no|0|n|ложь)$/.test(value)) {
    return false;
  }

  return null;
};

const isNumberType = (spec: string): boolean =>
  /\b(number|numeric|float|double|decimal|int|integer|money|amount|price|rate|sum|qty|quantity|percent)\b/i.test(
    spec,
  );

const isIntegerType = (spec: string): boolean =>
  /\b(int|integer)\b/i.test(spec);

const isBooleanType = (spec: string): boolean => /\bbool(ean)?\b/i.test(spec);

const isArrayType = (spec: string): boolean =>
  /\[\s*\]$|^array\b|\barray\b/i.test(spec) || /\w\[\]$/.test(spec.trim());

const elementType = (spec: string): string =>
  spec.replace(/\[\s*\]$/, '').replace(/^array(?:\s+of)?\s*/i, '').trim();

/**
 * Приводит значение к типу из схемы. Схема — как в llm.extract: строковый
 * дескриптор («number», «integer», «boolean», «string», «number[]») либо
 * вложенный объект/массив. Незнакомые типы и строки оставляем как есть.
 */
export const coerceValue = (value: unknown, spec: unknown): unknown => {
  if (value === null || value === undefined) {
    return value ?? null;
  }

  if (typeof spec === 'string') {
    const trimmed = spec.trim();

    if (isArrayType(trimmed) && Array.isArray(value)) {
      const element = elementType(trimmed);

      return value.map((item) => coerceValue(item, element));
    }

    if (isBooleanType(trimmed)) {
      const parsed = parseBooleanLike(value);

      return parsed === null ? value : parsed;
    }

    if (isNumberType(trimmed)) {
      const parsed = parseNumberLike(value);

      if (parsed === null) {
        return value;
      }

      return isIntegerType(trimmed) ? Math.round(parsed) : parsed;
    }

    return value;
  }

  if (Array.isArray(spec)) {
    if (!Array.isArray(value)) {
      return value;
    }

    const element = spec[0];

    return value.map((item) => coerceValue(item, element));
  }

  if (spec && typeof spec === 'object') {
    if (Array.isArray(value)) {
      return value.map((item) => coerceValue(item, spec));
    }

    if (value && typeof value === 'object') {
      return coerceToSchema(
        value as Record<string, unknown>,
        spec as Record<string, unknown>,
      );
    }
  }

  return value;
};

/** Приводит все поля объекта к типам из схемы (рекурсивно). */
export const coerceToSchema = (
  data: Record<string, unknown>,
  schema: Record<string, unknown> | string,
): Record<string, unknown> => {
  if (!schema || typeof schema === 'string') {
    return data;
  }

  const result: Record<string, unknown> = { ...data };

  for (const [key, spec] of Object.entries(schema)) {
    if (key in result) {
      result[key] = coerceValue(result[key], spec);
    }
  }

  return result;
};

/** Системный промпт для извлечения полей: акцент на точность и форматы. */
export const buildExtractSystem = (extra?: string): string =>
  [
    'Ты извлекаешь структурированные данные из текста веб-страницы или сообщения.',
    'Верни только JSON-объект строго по схеме: те же ключи, тех же типов.',
    'Бери значения дословно из текста, не считай и не выдумывай. Если поля нет — null.',
    'Числа возвращай числами: без валютных символов, единиц и пробелов. Десятичный разделитель — точка (запятую и пробелы-тысячи убери).',
    'Проценты — числом без знака %. Даты — строкой как в источнике.',
    'Если поле в схеме — массив, верни массив всех подходящих записей, а не первую.',
    'Когда значений несколько (например, разные курсы или предложения), выбери самое релевантное запросу и самое свежее.',
    extra ? `Дополнительно: ${extra}` : '',
  ]
    .filter(Boolean)
    .join(' ');
