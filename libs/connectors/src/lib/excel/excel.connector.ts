import * as ExcelJS from 'exceljs';
import {
  Connector,
  ConnectorExecuteInput,
  ConnectorExecuteResult,
} from '../types';
import { asRecord, firstNonEmpty, mergeContext } from '../interpolate';
import {
  downloadCloudFile,
  findCloudFile,
  listCloudFiles,
  looksLikeUrl,
  resolveCloud,
  resolveDocument,
  testCloud,
  uploadCloudFile,
  type CloudFile,
  type CloudProvider,
} from './excel.cloud';
import {
  alignToHeaders,
  appendObjectRow,
  findMatchingRows,
  matchHeader,
  readSheetColumns,
  rowPayload,
  sheetToObjects,
  updateMatchingRows,
} from './excel.sheet';
import {
  applyExcelPlan,
  contextFromPrevious,
  planSheetEdits,
  sheetSnapshot,
} from './excel.apply';

const loadWorkbook = async (buffer: Buffer, sheetName: string) => {
  const workbook = new ExcelJS.Workbook();

  await workbook.xlsx.load(buffer as never);

  const sheet =
    workbook.getWorksheet(sheetName) ||
    workbook.worksheets[0] ||
    workbook.addWorksheet(sheetName);

  return { workbook, sheet };
};

const workbookBuffer = async (workbook: ExcelJS.Workbook) =>
  Buffer.from(await workbook.xlsx.writeBuffer());

const toFilePayload = (file: CloudFile, extra: Record<string, unknown> = {}) => ({
  fileName: file.name,
  fileId: file.id,
  path: file.id,
  mimeType: file.mimeType,
  provider: file.provider,
  webUrl: file.webUrl,
  publicPath: file.publicPath,
  ...extra,
});

const fileFromContext = (
  ctx: Record<string, unknown>,
  provider: CloudProvider,
): CloudFile | undefined => {
  const id = firstNonEmpty(ctx['fileId'], ctx['path']);
  const fileName = firstNonEmpty(ctx['fileName']);

  if (!id || !fileName) {
    return undefined;
  }

  if (ctx['provider'] && String(ctx['provider']) !== provider) {
    return undefined;
  }

  return {
    id,
    name: fileName,
    mimeType: String(ctx['mimeType'] || ''),
    provider,
    webUrl: firstNonEmpty(ctx['webUrl']) || undefined,
    publicPath: firstNonEmpty(ctx['publicPath']) || undefined,
  };
};

const resolveWorkbookFile = async (
  ctx: Record<string, unknown>,
  credentials: Record<string, string>,
  provider: CloudProvider,
  token: string,
  folder?: string,
  fileUrl?: string,
) => {
  const link = firstNonEmpty(
    ctx['fileUrl'],
    fileUrl,
    looksLikeUrl(firstNonEmpty(ctx['fileName']))
      ? firstNonEmpty(ctx['fileName'])
      : '',
    looksLikeUrl(firstNonEmpty(ctx['webUrl']))
      ? firstNonEmpty(ctx['webUrl'])
      : '',
  );

  if (link) {
    return resolveDocument(link, token);
  }

  const fromPrevious = fileFromContext(ctx, provider);

  if (fromPrevious) {
    return fromPrevious;
  }

  const fileName = firstNonEmpty(ctx['fileName'], credentials['fileName']);

  return findCloudFile(provider, token, fileName, folder);
};

const rowLimit = (ctx: Record<string, unknown>) =>
  Math.min(Math.max(Number(ctx['limit'] || 500) || 500, 1), 5000);

const DUMP_KEYS = /^(url|title|query|snippet|html|contentType|answer|results)$/i;

const taskInstruction = (
  ctx: Record<string, unknown>,
  input: ConnectorExecuteInput,
) =>
  firstNonEmpty(
    ctx['instruction'],
    asRecord(input.context?.input)['prompt'],
    asRecord(input.context?.input)['message'],
    asRecord(input.context?.input)['text'],
  );

const needsLlmPlacement = (
  headers: string[],
  payload: Record<string, unknown>,
) => {
  const keys = Object.keys(payload);

  if (keys.some((key) => DUMP_KEYS.test(key))) {
    return true;
  }

  if (headers.length === 0) {
    return false;
  }

  return keys.length > 0 && Object.keys(alignToHeaders(headers, payload)).length === 0;
};

const factsForSheet = (input: ConnectorExecuteInput) =>
  [
    contextFromPrevious(input.previousResult),
    contextFromPrevious(input.context?.input),
  ]
    .filter(Boolean)
    .join('\n\n');

export const excelConnector: Connector = {
  id: 'excel',
  name: 'Excel / Яндекс Таблицы',
  description:
    'Яндекс Таблицы и .xlsx на Яндекс Диске, Google Drive или по ссылке. Ищет, пишет и через excel.apply делает любые правки листа по задаче (LLM + коннектор).',
  credentialFields: [
    {
      key: 'provider',
      label: 'Источник',
      type: 'select',
      options: [
        { value: 'yandex', label: 'Яндекс Диск / Яндекс Таблицы' },
        { value: 'google', label: 'Google Drive' },
        { value: 'url', label: 'Прямая ссылка' },
      ],
    },
    {
      key: 'fileUrl',
      label: 'Ссылка на таблицу',
      placeholder: 'https://disk.yandex.ru/i/... или docs.yandex.ru',
    },
    {
      key: 'accessToken',
      label: 'OAuth-токен Диска (для закрытых файлов и записи)',
      secret: true,
      placeholder: 'OAuth-токен Яндекс Диска',
    },
    {
      key: 'folder',
      label: 'Папка (необязательно)',
      placeholder: 'disk:/Документы или ID папки Google',
    },
    { key: 'sheet', label: 'Лист', placeholder: 'Заявки' },
  ],
  actions: [
    {
      id: 'find_file',
      name: 'Найти таблицу',
      description:
        'Открывает Яндекс Таблицу / .xlsx по ссылке или ищет на Диске по имени. Без имени — список таблиц.',
      paramsSchema: {
        fileName: {
          type: 'string',
          description: 'Имя файла на Диске, например заявки.xlsx',
        },
        fileUrl: {
          type: 'string',
          description: 'Ссылка disk.yandex.ru, docs.yandex.ru или Google Sheets',
        },
      },
    },
    {
      id: 'read_rows',
      name: 'Прочитать строки',
      description:
        'Возвращает строки как объекты {заголовок листа: значение}',
      paramsSchema: {
        fileName: { type: 'string', description: 'Название файла на Диске' },
        fileUrl: { type: 'string', description: 'Ссылка на таблицу' },
        sheet: { type: 'string', description: 'Переопределить лист' },
        limit: {
          type: 'number',
          description: 'Максимум строк, по умолчанию 500, максимум 5000',
        },
      },
    },
    {
      id: 'find_rows',
      name: 'Найти записи',
      description:
        'Ищет строки по заголовку колонки: field/op/value (eq, contains, gt, lt)',
      paramsSchema: {
        fileName: { type: 'string', description: 'Название файла на Диске' },
        fileUrl: { type: 'string', description: 'Ссылка на таблицу' },
        sheet: { type: 'string', description: 'Переопределить лист' },
        field: {
          type: 'string',
          description: 'Заголовок колонки, как в таблице',
        },
        op: {
          type: 'string',
          description: 'eq, contains, gt, gte, lt, lte, neq, empty, not_empty',
        },
        value: { type: 'string', description: 'Что искать в колонке' },
        limit: { type: 'number', description: 'Максимум строк для просмотра' },
      },
    },
    {
      id: 'append_row',
      name: 'Добавить строку',
      description:
        'Дописывает строку в колонки листа. Поля — как заголовки или row={Заголовок: значение}',
      paramsSchema: {
        fileName: { type: 'string', description: 'Название файла на Диске' },
        fileUrl: { type: 'string', description: 'Ссылка на таблицу' },
        sheet: { type: 'string', description: 'Переопределить лист' },
        row: {
          type: 'object',
          description: 'Значения по заголовкам листа',
        },
      },
    },
    {
      id: 'update_row',
      name: 'Обновить запись',
      description:
        'Находит строки по field/op/value и пишет новые значения из row в те же колонки',
      paramsSchema: {
        fileName: { type: 'string', description: 'Название файла на Диске' },
        fileUrl: { type: 'string', description: 'Ссылка на таблицу' },
        sheet: { type: 'string', description: 'Переопределить лист' },
        field: { type: 'string', description: 'Колонка для поиска' },
        op: { type: 'string', description: 'Оператор сравнения, по умолчанию eq' },
        value: { type: 'string', description: 'Значение для поиска' },
        row: {
          type: 'object',
          description: 'Какие ячейки обновить',
        },
      },
    },
    {
      id: 'apply',
      name: 'Сделать в таблице',
      description:
        'LLM читает лист и выполняет любую задачу: формулы, итоги, дубли, колонки, сортировка, заполнение из поиска, перезапись. instruction — формулировка пользователя.',
      paramsSchema: {
        fileName: { type: 'string', description: 'Название файла на Диске' },
        fileUrl: { type: 'string', description: 'Ссылка на таблицу' },
        sheet: { type: 'string', description: 'Переопределить лист' },
        instruction: {
          type: 'string',
          description: 'Что сделать с таблицей, словами пользователя',
        },
        limit: {
          type: 'number',
          description: 'Сколько строк отдать модели, по умолчанию 400',
        },
      },
    },
  ],
  testConnection: async (credentials) => {
    try {
      const { provider, token } = resolveCloud(credentials);
      const message = await testCloud(
        provider,
        token,
        credentials['fileUrl']?.trim() || undefined,
      );

      return { ok: true, message };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Excel connection error',
      };
    }
  },
  execute: async (
    input: ConnectorExecuteInput,
  ): Promise<ConnectorExecuteResult> => {
    try {
      const { provider, token, folder, fileUrl } = resolveCloud(
        input.credentials,
      );
      const ctx = mergeContext(
        input.params,
        input.previousResult,
        input.context,
      );
      const sheetName = String(
        ctx['sheet'] || input.credentials['sheet'] || 'Заявки',
      );
      const link = firstNonEmpty(ctx['fileUrl'], fileUrl);

      if (input.action === 'find_file') {
        if (link) {
          const file = await resolveDocument(link, token);

          return { ok: true, data: toFilePayload(file) };
        }

        const fileName = firstNonEmpty(
          ctx['fileName'],
          input.credentials['fileName'],
        );

        if (!fileName) {
          const files = await listCloudFiles(provider, token, folder);

          if (files.length === 1) {
            return { ok: true, data: toFilePayload(files[0]) };
          }

          return {
            ok: true,
            data: {
              files: files.map((file) => toFilePayload(file)),
              count: files.length,
            },
          };
        }

        const file = await findCloudFile(provider, token, fileName, folder);

        return { ok: true, data: toFilePayload(file) };
      }

      if (
        input.action === 'append_row' ||
        input.action === 'read_rows' ||
        input.action === 'find_rows' ||
        input.action === 'update_row' ||
        input.action === 'apply'
      ) {
        const file = await resolveWorkbookFile(
          ctx,
          input.credentials,
          provider,
          token,
          folder,
          fileUrl,
        );
        const buffer = await downloadCloudFile(token, file);
        const { workbook, sheet } = await loadWorkbook(buffer, sheetName);

        if (input.action === 'apply' || input.action === 'append_row' || input.action === 'update_row') {
          const snapshot = sheetSnapshot(sheet, Math.min(rowLimit(ctx), 400));
          const payload = rowPayload(ctx);
          const instruction = taskInstruction(ctx, input);
          const placeWithLlm =
            input.action === 'apply' ||
            Boolean(ctx['instruction']) ||
            needsLlmPlacement(snapshot.headers, payload);

          if (placeWithLlm) {
            const task =
              instruction ||
              'Запиши данные из фактов в подходящие колонки этой таблицы. Клади значения только в существующие заголовки.';

            const plan = await planSheetEdits(
              task,
              snapshot,
              factsForSheet(input),
              input.credentials,
              input.signal,
            );
            const applied = applyExcelPlan(sheet, plan.operations);

            if (applied.wrote) {
              await uploadCloudFile(token, file, await workbookBuffer(workbook));
            }

            const { headers, rows } = sheetToObjects(sheet, 50);

            return {
              ok: true,
              data: toFilePayload(file, {
                sheet: sheet.name,
                headers,
                count: rows.length,
                applied: applied.applied,
                wrote: applied.wrote,
                notes: applied.notes,
                summary: plan.summary,
                text: plan.text,
              }),
            };
          }
        }

        if (input.action === 'append_row') {
          const headers = readSheetColumns(sheet).headers;
          const payload = rowPayload(ctx);
          const aligned =
            headers.length > 0 ? alignToHeaders(headers, payload) : payload;
          const written = appendObjectRow(
            sheet,
            Object.keys(aligned).length ? aligned : payload,
            { expand: headers.length === 0 },
          );
          await uploadCloudFile(token, file, await workbookBuffer(workbook));

          return {
            ok: true,
            data: toFilePayload(file, {
              sheet: sheet.name,
              headers: written.headers,
              row: written.values,
              text: 'Записал строку в таблицу',
            }),
          };
        }

        if (input.action === 'update_row') {
          const headers = readSheetColumns(sheet).headers;
          const field =
            matchHeader(headers, firstNonEmpty(ctx['field'])) ||
            firstNonEmpty(ctx['field']);
          const op = firstNonEmpty(ctx['op']) || 'eq';
          const explicitRow = rowPayload({
            row: ctx['row'],
            values: ctx['values'],
            fields: ctx['fields'],
          });
          const patch = alignToHeaders(
            headers,
            Object.keys(explicitRow).length ? explicitRow : rowPayload(ctx),
          );
          const updated = updateMatchingRows(
            sheet,
            field,
            op,
            ctx['value'],
            Object.keys(patch).length ? patch : explicitRow,
          );
          await uploadCloudFile(token, file, await workbookBuffer(workbook));

          return {
            ok: true,
            data: toFilePayload(file, {
              sheet: sheet.name,
              field,
              op,
              value: ctx['value'],
              updated: updated.updated,
              rows: updated.rows,
              items: updated.rows,
              count: updated.updated,
            }),
          };
        }

        const { headers, rows } = sheetToObjects(sheet, rowLimit(ctx));

        if (input.action === 'find_rows') {
          const field = firstNonEmpty(ctx['field']);
          const op = firstNonEmpty(ctx['op']) || (field ? 'contains' : 'eq');
          const found = findMatchingRows(rows, field, op, ctx['value']);

          return {
            ok: true,
            data: toFilePayload(file, {
              sheet: sheet.name,
              headers,
              field,
              op,
              value: ctx['value'],
              rows: found,
              items: found,
              count: found.length,
            }),
          };
        }

        return {
          ok: true,
          data: toFilePayload(file, {
            sheet: sheet.name,
            headers,
            rows,
            items: rows,
            count: rows.length,
          }),
        };
      }

      return { ok: false, error: `Неизвестное действие: ${input.action}` };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Excel connector error',
      };
    }
  },
};
