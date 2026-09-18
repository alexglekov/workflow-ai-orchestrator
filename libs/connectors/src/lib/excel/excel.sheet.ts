import type * as ExcelJS from 'exceljs';

const META_KEYS = new Set([
  'fileName',
  'fileUrl',
  'sheet',
  'limit',
  'field',
  'op',
  'value',
  'provider',
  'fileId',
  'path',
  'mimeType',
  'webUrl',
  'publicPath',
  'headers',
  'rows',
  'count',
  'row',
  'values',
  'fields',
  'rowIndex',
  'items',
  'files',
  'accessToken',
  'folder',
  'file',
  'query',
  'filters',
  'match',
  'patch',
  'updates',
  'updated',
  'instruction',
  'operations',
  'summary',
  'notes',
  'applied',
  'wrote',
]);

const HEADER_ALIASES: Record<string, string[]> = {
  name: ['имя', 'фио', 'клиент', 'from', 'отправитель', 'название', 'customer'],
  phone: ['телефон', 'тел', 'номер', 'mobile', 'тел.'],
  company: ['компания', 'организация', 'фирма', 'subject', 'тема'],
  amount: ['сумма', 'итого', 'стоимость'],
  email: ['почта', 'e-mail', 'mail', 'e_mail'],
  text: ['текст', 'сообщение', 'комментарий', 'comment', 'body'],
  date: ['дата', 'createdat', 'created_at', 'created'],
  rate: ['курс', 'цена', 'price', 'lastprice', 'котировка'],
  status: ['статус', 'состояние'],
};

export const normalizeHeader = (value: string) =>
  value.trim().toLowerCase().replace(/\s+/g, ' ');

const aliasGroup = (field: string): string[] => {
  const needle = normalizeHeader(field);

  if (!needle) {
    return [];
  }

  const group = new Set<string>([needle]);

  for (const [canonical, aliases] of Object.entries(HEADER_ALIASES)) {
    if (needle === canonical || aliases.includes(needle)) {
      group.add(canonical);
      for (const alias of aliases) {
        group.add(alias);
      }
    }
  }

  return [...group];
};

export const alignToHeaders = (
  headers: string[],
  data: Record<string, unknown>,
): Record<string, unknown> => {
  const aligned: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (key === 'rowIndex' || value == null || value === '') {
      continue;
    }

    const header = matchHeader(headers, key);

    if (!header) {
      continue;
    }

    aligned[header] = value;
  }

  return aligned;
};

export const matchHeader = (
  headers: string[],
  field: string,
): string | undefined => {
  const needle = normalizeHeader(field);

  if (!needle || headers.length === 0) {
    return undefined;
  }

  const exact = headers.find((header) => normalizeHeader(header) === needle);

  if (exact) {
    return exact;
  }

  const aliases = aliasGroup(field);
  const byAlias = headers.find((header) =>
    aliases.includes(normalizeHeader(header)),
  );

  if (byAlias) {
    return byAlias;
  }

  return headers.find((header) => {
    const name = normalizeHeader(header);

    return (
      name.length >= 2 &&
      needle.length >= 2 &&
      (name.includes(needle) || needle.includes(name))
    );
  });
};

export const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

export const rowPayload = (
  ctx: Record<string, unknown>,
): Record<string, unknown> => {
  const nested = asRecord(ctx['row']);
  const values = asRecord(ctx['values']);
  const fields = asRecord(ctx['fields']);
  const flat: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(ctx)) {
    if (META_KEYS.has(key) || value == null || value === '') {
      continue;
    }

    if (typeof value === 'object') {
      continue;
    }

    flat[key] = value;
  }

  return { ...flat, ...fields, ...values, ...nested };
};

export const cellValue = (value: unknown): unknown => {
  if (value == null) {
    return '';
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;

    if (Array.isArray(record['richText'])) {
      return (record['richText'] as Array<{ text?: string }>)
        .map((part) => part.text || '')
        .join('');
    }

    if (record['text'] != null) {
      return record['text'];
    }

    if ('result' in record) {
      return cellValue(record['result']);
    }
  }

  return value;
};

const uniqueHeader = (name: string, used: Map<string, number>): string => {
  const count = used.get(name) ?? 0;
  used.set(name, count + 1);

  return count === 0 ? name : `${name}_${count + 1}`;
};

const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const text = String(value ?? '')
    .trim()
    .replace(/\s/g, '')
    .replace(',', '.');

  if (!text || Number.isNaN(Number(text))) {
    return null;
  }

  return Number(text);
};

export const compareCell = (
  left: unknown,
  op: string,
  rawRight: unknown,
): boolean => {
  const right = rawRight;
  const operator = (op || 'eq').trim().toLowerCase();

  if (operator === 'empty') {
    return left == null || String(left).trim() === '';
  }

  if (operator === 'not_empty') {
    return !(left == null || String(left).trim() === '');
  }

  if (operator === 'contains') {
    return String(left ?? '')
      .toLowerCase()
      .includes(String(right ?? '').toLowerCase());
  }

  const leftNumber = asNumber(left);
  const rightNumber = asNumber(right);

  if (
    leftNumber != null &&
    rightNumber != null &&
    ['gt', 'gte', 'lt', 'lte', 'eq', 'neq'].includes(operator)
  ) {
    if (operator === 'gt') return leftNumber > rightNumber;
    if (operator === 'gte') return leftNumber >= rightNumber;
    if (operator === 'lt') return leftNumber < rightNumber;
    if (operator === 'lte') return leftNumber <= rightNumber;
    if (operator === 'eq') return leftNumber === rightNumber;

    return leftNumber !== rightNumber;
  }

  const leftText = String(left ?? '')
    .trim()
    .toLowerCase();
  const rightText = String(right ?? '')
    .trim()
    .toLowerCase();

  if (operator === 'gt') return leftText > rightText;
  if (operator === 'gte') return leftText >= rightText;
  if (operator === 'lt') return leftText < rightText;
  if (operator === 'lte') return leftText <= rightText;
  if (operator === 'eq') return leftText === rightText;
  if (operator === 'neq') return leftText !== rightText;

  return false;
};

export const findMatchingRows = (
  rows: Array<Record<string, unknown>>,
  field: string,
  op: string,
  value: unknown,
): Array<Record<string, unknown>> => {
  const needle = field.trim();

  if (!needle) {
    return rows;
  }

  return rows.filter((row) => {
    const header = matchHeader(Object.keys(row), needle) || needle;

    return compareCell(row[header], op, value);
  });
};

type SheetColumns = {
  headers: string[];
  colOf: Map<string, number>;
};

export const readSheetColumns = (sheet: ExcelJS.Worksheet): SheetColumns => {
  const headerRow = sheet.getRow(1);
  const lastCol = Math.max(
    headerRow.cellCount || 0,
    sheet.columnCount || 0,
    sheet.actualColumnCount || 0,
  );
  const used = new Map<string, number>();
  const headers: string[] = [];
  const colOf = new Map<string, number>();

  for (let col = 1; col <= lastCol; col += 1) {
    const raw = String(cellValue(headerRow.getCell(col).value) ?? '').trim();

    if (!raw && col > (headerRow.actualCellCount || headerRow.cellCount || 0)) {
      continue;
    }

    const name = uniqueHeader(raw || `col${col}`, used);
    headers.push(name);
    colOf.set(name, col);
  }

  return { headers, colOf };
};

export const sheetToObjects = (
  sheet: ExcelJS.Worksheet,
  limit: number,
): { headers: string[]; rows: Array<Record<string, unknown>> } => {
  const { headers, colOf } = readSheetColumns(sheet);

  if (headers.length === 0) {
    return { headers: [], rows: [] };
  }

  const rows: Array<Record<string, unknown>> = [];

  sheet.eachRow((excelRow, index) => {
    if (index === 1 || rows.length >= limit) {
      return;
    }

    const row: Record<string, unknown> = { rowIndex: index };

    for (const header of headers) {
      const col = colOf.get(header);

      if (col) {
        row[header] = cellValue(excelRow.getCell(col).value);
      }
    }

    rows.push(row);
  });

  return { headers, rows };
};

const stampNow = (headers: string[], data: Record<string, unknown>) => {
  const stamp = headers.find((header) =>
    ['createdat', 'created_at', 'дата', 'date', 'created'].includes(
      normalizeHeader(header),
    ),
  );

  if (!stamp) {
    return data;
  }

  if (matchHeader(Object.keys(data), stamp)) {
    return data;
  }

  return { ...data, [stamp]: new Date().toISOString() };
};

const ensureColumns = (
  sheet: ExcelJS.Worksheet,
  columns: SheetColumns,
  keys: string[],
): SheetColumns => {
  const headers = [...columns.headers];
  const colOf = new Map(columns.colOf);

  for (const key of keys) {
    if (matchHeader(headers, key)) {
      continue;
    }

    const col = headers.length + 1;
    headers.push(key);
    colOf.set(key, col);
    sheet.getRow(1).getCell(col).value = key;
  }

  sheet.getRow(1).commit?.();

  return { headers, colOf };
};

const valuesForHeaders = (
  headers: string[],
  data: Record<string, unknown>,
): unknown[] =>
  headers.map((header) => {
    const key = matchHeader(Object.keys(data), header);

    return key != null ? data[key] : '';
  });

export const appendObjectRow = (
  sheet: ExcelJS.Worksheet,
  payload: Record<string, unknown>,
  options?: { expand?: boolean },
): { headers: string[]; values: unknown[] } => {
  const incoming = Object.keys(payload);

  if (incoming.length === 0) {
    throw new Error(
      'Нечего записывать: нет полей строки. Передайте значения из предыдущего шага или row с ключами как у заголовков листа.',
    );
  }

  let columns = readSheetColumns(sheet);
  const expand = options?.expand !== false || columns.headers.length === 0;

  if (columns.headers.length === 0) {
    sheet.addRow(incoming);
    columns = readSheetColumns(sheet);
  }

  const data = stampNow(columns.headers, payload);
  columns = expand
    ? ensureColumns(sheet, columns, Object.keys(data))
    : columns;
  const aligned = expand ? data : alignToHeaders(columns.headers, data);
  const values = valuesForHeaders(columns.headers, aligned);
  sheet.addRow(values);

  return { headers: columns.headers, values };
};

export const updateMatchingRows = (
  sheet: ExcelJS.Worksheet,
  field: string,
  op: string,
  value: unknown,
  patch: Record<string, unknown>,
): { updated: number; rows: Array<Record<string, unknown>> } => {
  if (!field.trim()) {
    throw new Error(
      'Чтобы обновить запись, укажите поле поиска: field и value по заголовку колонки.',
    );
  }

  const patchKeys = Object.keys(patch);

  if (patchKeys.length === 0) {
    throw new Error(
      'Нечего обновлять: передайте row с новыми значениями по заголовкам листа.',
    );
  }

  const { headers, rows } = sheetToObjects(sheet, 5000);
  const matches = findMatchingRows(rows, field, op || 'eq', value);

  if (matches.length === 0) {
    return { updated: 0, rows: [] };
  }

  let columns = readSheetColumns(sheet);
  columns = ensureColumns(sheet, columns, patchKeys);

  for (const match of matches) {
    const index = Number(match['rowIndex']);

    if (!Number.isFinite(index) || index < 2) {
      continue;
    }

    const excelRow = sheet.getRow(index);

    for (const header of columns.headers) {
      const key = matchHeader(patchKeys, header);

      if (!key) {
        continue;
      }

      const col = columns.colOf.get(header);

      if (col) {
        excelRow.getCell(col).value = patch[key] as ExcelJS.CellValue;
      }
    }

    excelRow.commit();
  }

  return {
    updated: matches.length,
    rows: matches.map((row) => ({ ...row, ...patch })),
  };
};

export const deleteMatchingRows = (
  sheet: ExcelJS.Worksheet,
  field: string,
  op: string,
  value: unknown,
): { deleted: number; rows: Array<Record<string, unknown>> } => {
  if (!field.trim()) {
    throw new Error(
      'Чтобы удалить записи, укажите поле поиска: field и value по заголовку колонки.',
    );
  }

  const { rows } = sheetToObjects(sheet, 5000);
  const matches = findMatchingRows(rows, field, op || 'eq', value);
  const indexes = matches
    .map((row) => Number(row['rowIndex']))
    .filter((index) => Number.isFinite(index) && index >= 2)
    .sort((left, right) => right - left);

  for (const index of indexes) {
    sheet.spliceRows(index, 1);
  }

  return { deleted: indexes.length, rows: matches };
};

export const replaceSheet = (
  sheet: ExcelJS.Worksheet,
  headers: string[],
  rows: Array<Record<string, unknown>>,
): { headers: string[]; count: number } => {
  let names = headers
    .map((header) => String(header || '').trim())
    .filter(Boolean);

  if (names.length === 0) {
    const first = rows[0] || {};
    names = Object.keys(first).filter((key) => key !== 'rowIndex');
  }

  if (names.length === 0) {
    throw new Error('Нельзя перезаписать лист без заголовков и строк');
  }

  const last = Math.max(sheet.rowCount || 0, sheet.actualRowCount || 0, 1);
  sheet.spliceRows(1, last);
  sheet.addRow(names);

  for (const row of rows) {
    sheet.addRow(
      names.map((header) => {
        const key = matchHeader(Object.keys(row), header);

        return key != null ? cellValue(row[key]) : '';
      }),
    );
  }

  return { headers: names, count: rows.length };
};

export const sortSheet = (
  sheet: ExcelJS.Worksheet,
  field: string,
  dir = 'asc',
): { headers: string[]; count: number } => {
  const { headers, rows } = sheetToObjects(sheet, 5000);
  const header = matchHeader(headers, field) || field;
  const sign = /desc|убыв/i.test(dir) ? -1 : 1;
  const sorted = [...rows].sort((left, right) => {
    const leftNumber = asNumber(left[header]);
    const rightNumber = asNumber(right[header]);

    if (leftNumber != null && rightNumber != null) {
      return (leftNumber - rightNumber) * sign;
    }

    return (
      String(left[header] ?? '').localeCompare(
        String(right[header] ?? ''),
        'ru',
        { numeric: true, sensitivity: 'base' },
      ) * sign
    );
  });

  return replaceSheet(sheet, headers, sorted);
};

export const renameSheetColumn = (
  sheet: ExcelJS.Worksheet,
  from: string,
  to: string,
): string => {
  const columns = readSheetColumns(sheet);
  const header = matchHeader(columns.headers, from);

  if (!header) {
    throw new Error(`Нет колонки «${from}»`);
  }

  const name = String(to || '').trim();

  if (!name) {
    throw new Error('Укажите новое имя колонки');
  }

  const col = columns.colOf.get(header);

  if (!col) {
    throw new Error(`Нет колонки «${from}»`);
  }

  sheet.getRow(1).getCell(col).value = name;
  sheet.getRow(1).commit?.();

  return name;
};

export const setSheetCell = (
  sheet: ExcelJS.Worksheet,
  rowIndex: number,
  column: string,
  value: unknown,
): void => {
  let columns = readSheetColumns(sheet);
  columns = ensureColumns(sheet, columns, [column]);
  const header = matchHeader(columns.headers, column) || column;
  const col = columns.colOf.get(header);
  const row = Number(rowIndex);

  if (!col || !Number.isFinite(row) || row < 2) {
    throw new Error(`Нельзя записать ячейку ${column}:${rowIndex}`);
  }

  const excelRow = sheet.getRow(row);
  excelRow.getCell(col).value = value as ExcelJS.CellValue;
  excelRow.commit();
};

export type SheetOperation = {
  type?: string;
  row?: Record<string, unknown>;
  rows?: Array<Record<string, unknown>>;
  headers?: string[];
  field?: string;
  op?: string;
  value?: unknown;
  column?: string;
  rowIndex?: number;
  from?: string;
  to?: string;
  dir?: string;
};

const asRows = (value: unknown): Array<Record<string, unknown>> => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => asRecord(item))
    .filter((item) => Object.keys(item).length > 0);
};

export const applySheetOperations = (
  sheet: ExcelJS.Worksheet,
  operations: SheetOperation[],
): { applied: number; wrote: boolean; notes: string[] } => {
  const notes: string[] = [];
  let applied = 0;
  let wrote = false;

  for (const raw of operations) {
    const type = String(raw.type || '').trim().toLowerCase();

    if (!type) {
      continue;
    }

    if (type === 'append' || type === 'add_row') {
      const columns = readSheetColumns(sheet);
      const incoming = asRecord(raw.row);
      const row =
        columns.headers.length > 0
          ? alignToHeaders(columns.headers, incoming)
          : incoming;

      if (Object.keys(row).length === 0) {
        notes.push('строка не сопоставилась с колонками листа');
        continue;
      }

      const written = appendObjectRow(sheet, row, {
        expand: columns.headers.length === 0,
      });
      notes.push(`добавлена строка (${written.headers.length} колонок)`);
      applied += 1;
      wrote = true;
      continue;
    }

    if (type === 'update' || type === 'patch') {
      const columns = readSheetColumns(sheet);
      const patch = alignToHeaders(columns.headers, asRecord(raw.row));
      const field =
        matchHeader(columns.headers, String(raw.field || '')) ||
        String(raw.field || '');

      if (Object.keys(patch).length === 0) {
        notes.push('нечего обновить: поля не совпали с заголовками');
        continue;
      }

      const updated = updateMatchingRows(
        sheet,
        field,
        String(raw.op || 'eq'),
        raw.value,
        patch,
      );
      notes.push(`обновлено записей: ${updated.updated}`);
      applied += 1;
      wrote = true;
      continue;
    }

    if (type === 'delete' || type === 'remove') {
      const deleted = deleteMatchingRows(
        sheet,
        String(raw.field || ''),
        String(raw.op || 'eq'),
        raw.value,
      );
      notes.push(`удалено записей: ${deleted.deleted}`);
      applied += 1;
      wrote = true;
      continue;
    }

    if (type === 'replace' || type === 'rewrite' || type === 'set_rows') {
      const replaced = replaceSheet(
        sheet,
        Array.isArray(raw.headers)
          ? raw.headers.map((item) => String(item))
          : [],
        asRows(raw.rows),
      );
      notes.push(`лист перезаписан: ${replaced.count} строк`);
      applied += 1;
      wrote = true;
      continue;
    }

    if (type === 'sort') {
      const sorted = sortSheet(
        sheet,
        String(raw.field || raw.column || ''),
        String(raw.dir || 'asc'),
      );
      notes.push(`сортировка «${raw.field || raw.column}»: ${sorted.count} строк`);
      applied += 1;
      wrote = true;
      continue;
    }

    if (type === 'clear') {
      replaceSheet(sheet, readSheetColumns(sheet).headers, []);
      notes.push('лист очищен, заголовки сохранены');
      applied += 1;
      wrote = true;
      continue;
    }

    if (type === 'rename_column' || type === 'rename') {
      const name = renameSheetColumn(
        sheet,
        String(raw.from || raw.field || ''),
        String(raw.to || raw.value || ''),
      );
      notes.push(`колонка переименована в «${name}»`);
      applied += 1;
      wrote = true;
      continue;
    }

    if (type === 'set' || type === 'set_cell') {
      setSheetCell(
        sheet,
        Number(raw.rowIndex),
        String(raw.column || raw.field || ''),
        raw.value,
      );
      notes.push(`ячейка ${raw.column || raw.field}:${raw.rowIndex} записана`);
      applied += 1;
      wrote = true;
      continue;
    }

    if (type === 'add_column') {
      const header = String(raw.column || raw.field || raw.to || '').trim();
      ensureColumns(sheet, readSheetColumns(sheet), [header]);
      notes.push(`добавлена колонка «${header}»`);
      applied += 1;
      wrote = true;
    }
  }

  return { applied, wrote, notes };
};
