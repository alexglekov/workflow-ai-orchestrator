import { completeLlm } from '../llm/complete';
import { parseJsonObject } from '../llm/parse-json';
import { resolveLlm } from '../llm/resolve';
import { firstNonEmpty, humanText } from '../interpolate';
import {
  applySheetOperations,
  asRecord,
  sheetToObjects,
  type SheetOperation,
} from './excel.sheet';
import type * as ExcelJS from 'exceljs';

const APPLY_SYSTEM = [
  'Ты записываешь данные в удалённую таблицу Excel. Задача пользователя говорит ЧТО писать, заголовки листа — КУДА.',
  'Верни только JSON: {"summary":"кратко что сделал","text":"ответ человеку","operations":[...]}',
  'operations.type: append | update | delete | replace | sort | clear | rename_column | set | add_column.',
  'Ключи в row/rows — в точности как заголовки листа. Синонимы сопоставляй сам: телефон→Телефон, курс/цена→колонка курса, имя→Имя/Клиент.',
  'append: {"type":"append","row":{Заголовок:значение}} — новая строка, значения только в существующие колонки.',
  'update: field/op/value находит строку, row — какие ячейки поменять. Если в задаче есть ключ (имя, телефон, id) и такая строка уже есть — update, иначе append.',
  'set: конкретная ячейка {"type":"set","rowIndex":2,"column":"Курс","value":95.1}, rowIndex с 2.',
  'delete/sort/clear/rename_column/add_column/replace — только если это явно просили. replace переписывает весь лист.',
  'Разложи факты из контекста (поиск, страница, письмо, запрос) по смыслу колонок. url, title, query, snippet, html в таблицу не пиши.',
  'Назвали колонку, строку или ячейку — пиши только туда. Новую колонку не создавай, пока не попросили «добавь колонку».',
  'Что некуда положить по заголовкам — не выдумывай поле, скажи в text. Формулы Excel не оставляй: подставляй готовые числа.',
].join(' ');

const asOperations = (value: unknown): SheetOperation[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => asRecord(item) as SheetOperation)
    .filter((item) => String(item.type || '').trim());
};

export const planSheetEdits = async (
  instruction: string,
  sheet: { name: string; headers: string[]; rows: Array<Record<string, unknown>> },
  context: string,
  credentials: Record<string, string>,
  signal?: AbortSignal,
): Promise<{
  summary: string;
  text: string;
  operations: SheetOperation[];
}> => {
  const llm = resolveLlm(credentials);

  if (!llm.apiKey) {
    throw new Error(
      'Для правок Excel через LLM нужен QWEN_API_KEY или ключ в подключении LLM',
    );
  }

  const preview = sheet.rows.slice(0, 400).map((row) => {
    const copy = { ...row };
    delete copy['rowIndex'];

    return copy;
  });
  const parsed = parseJsonObject(
    await completeLlm({
      ...llm,
      timeoutMs: 60_000,
      signal,
      json: true,
      temperature: 0.1,
      messages: [
        { role: 'system', content: APPLY_SYSTEM },
        {
          role: 'user',
          content: [
            `Задача: ${instruction}`,
            'Разложи значения по колонкам листа. Пиши только в те ячейки, которые нужны по задаче.',
            context ? `Факты для записи:\n${context.slice(0, 12_000)}` : '',
            `Лист «${sheet.name}», колонки (сюда класть ключи): ${sheet.headers.join(' | ') || '(пусто)'}, строк: ${sheet.rows.length}.`,
            `Сейчас на листе:\n${JSON.stringify(preview)}`,
          ]
            .filter(Boolean)
            .join('\n\n'),
        },
      ],
    }),
  );

  return planFromModelJson(parsed, sheet.headers);
};

export const planFromModelJson = (
  parsed: Record<string, unknown>,
  sheetHeaders: string[],
): {
  summary: string;
  text: string;
  operations: SheetOperation[];
} => {
  const operations = asOperations(parsed['operations']);
  const rows = Array.isArray(parsed['rows']) ? parsed['rows'] : [];
  const headers = Array.isArray(parsed['headers'])
    ? parsed['headers'].map((item) => String(item))
    : [];

  if (operations.length === 0 && rows.length > 0) {
    operations.push({
      type: 'replace',
      headers: headers.length ? headers : sheetHeaders,
      rows: rows as Array<Record<string, unknown>>,
    });
  }

  const summary = firstNonEmpty(parsed['summary'], parsed['text']) || 'Готово';
  const text = firstNonEmpty(parsed['text'], parsed['summary']) || summary;

  return { summary, text, operations };
};

export const applyExcelPlan = (
  sheet: ExcelJS.Worksheet,
  operations: SheetOperation[],
) => applySheetOperations(sheet, operations);

export const sheetSnapshot = (
  sheet: ExcelJS.Worksheet,
  limit: number,
) => {
  const { headers, rows } = sheetToObjects(sheet, limit);

  return {
    name: sheet.name,
    headers,
    rows,
  };
};

const compactFact = (value: unknown): unknown => {
  if (value == null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 40).map((item) => compactFact(item));
  }

  const record = asRecord(value);
  const keep = [
    'title',
    'url',
    'text',
    'snippet',
    'content',
    'answer',
    'price',
    'rate',
    'symbol',
    'from',
    'name',
    'phone',
    'subject',
    'amount',
  ];
  const out: Record<string, unknown> = {};

  for (const key of keep) {
    const nested = record[key];

    if (nested == null || nested === '') {
      continue;
    }

    out[key] =
      typeof nested === 'string' ? nested.slice(0, 800) : compactFact(nested);
  }

  for (const [key, nested] of Object.entries(record)) {
    if (out[key] != null || nested == null || nested === '' || META_SKIP.has(key)) {
      continue;
    }

    if (typeof nested === 'string' || typeof nested === 'number') {
      out[key] = typeof nested === 'string' ? nested.slice(0, 400) : nested;
    }
  }

  return Object.keys(out).length ? out : record;
};

const META_SKIP = new Set([
  'ok',
  'html',
  'audioBase64',
  'provider',
  'fileId',
  'path',
  'mimeType',
  'publicPath',
  'webUrl',
  'headers',
  'fileName',
  'connectionId',
  'chatId',
  'contentType',
]);

export const factsFromPrevious = (previous: unknown): string => {
  if (previous == null) {
    return '';
  }

  if (typeof previous === 'string') {
    return previous.slice(0, 12_000);
  }

  const record = asRecord(previous);
  const parts: string[] = [];
  const prose = firstNonEmpty(record['text'], record['answer'], record['summary']);

  if (prose) {
    parts.push(prose);
  }

  for (const key of ['results', 'rows', 'items', 'records', 'offers', 'tables']) {
    const listed = record[key];

    if (!Array.isArray(listed) || listed.length === 0) {
      continue;
    }

    parts.push(
      `${key}:\n${JSON.stringify(compactFact(listed.slice(0, 30)))}`.slice(
        0,
        8_000,
      ),
    );
  }

  if (record['json'] && typeof record['json'] === 'object') {
    parts.push(`json:\n${JSON.stringify(compactFact(record['json'])).slice(0, 4_000)}`);
  }

  const leftover = compactFact(record);

  if (leftover && typeof leftover === 'object' && !Array.isArray(leftover)) {
    const extra = { ...asRecord(leftover) };
    delete extra['text'];
    delete extra['answer'];
    delete extra['summary'];
    delete extra['results'];
    delete extra['rows'];
    delete extra['items'];
    delete extra['json'];

    if (Object.keys(extra).length) {
      parts.push(`поля:\n${JSON.stringify(extra).slice(0, 3_000)}`);
    }
  }

  const packed = parts.filter(Boolean).join('\n\n').slice(0, 12_000);

  return packed || humanText(previous);
};

export const contextFromPrevious = (previous: unknown): string =>
  factsFromPrevious(previous);
