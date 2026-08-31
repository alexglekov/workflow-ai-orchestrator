import * as ExcelJS from 'exceljs';
import {
  Connector,
  ConnectorExecuteInput,
  ConnectorExecuteResult,
} from '../types';
import { firstNonEmpty, mergeContext } from '../interpolate';
import {
  downloadCloudFile,
  findCloudFile,
  looksLikeUrl,
  resolveCloud,
  resolveDocument,
  testCloud,
  uploadCloudFile,
  type CloudFile,
  type CloudProvider,
} from './excel.cloud';

const HEADERS = ['Name', 'Phone', 'Company', 'Amount', 'CreatedAt'];

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

export const excelConnector: Connector = {
  id: 'excel',
  name: 'Excel',
  description:
    'Excel по прямой ссылке или на Google Drive / Яндекс Диске',
  credentialFields: [
    {
      key: 'provider',
      label: 'Источник',
      type: 'select',
      options: [
        { value: 'yandex', label: 'Яндекс Диск' },
        { value: 'google', label: 'Google Drive' },
        { value: 'url', label: 'Прямая ссылка' },
      ],
    },
    {
      key: 'fileUrl',
      label: 'Ссылка на документ',
      placeholder: 'https://disk.yandex.ru/... или Google Sheets',
    },
    {
      key: 'accessToken',
      label: 'OAuth-токен (если Диск)',
      secret: true,
      placeholder: 'Токен Диска',
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
      name: 'Найти файл',
      description: 'Открывает документ по ссылке или ищет .xlsx на Диске по имени',
      paramsSchema: {
        fileName: {
          type: 'string',
          description: 'Имя файла, например заявки.xlsx',
        },
        fileUrl: {
          type: 'string',
          description: 'Прямая ссылка на документ',
        },
      },
    },
    {
      id: 'append_row',
      name: 'Добавить строку',
      description:
        'Находит файл по имени и дописывает name, phone, company, amount',
      paramsSchema: {
        fileName: { type: 'string', description: 'Название файла на Диске' },
        fileUrl: { type: 'string', description: 'Прямая ссылка на документ' },
        sheet: { type: 'string', description: 'Переопределить лист' },
      },
    },
    {
      id: 'read_rows',
      name: 'Прочитать строки',
      description: 'Находит файл по имени и возвращает строки листа',
      paramsSchema: {
        fileName: { type: 'string', description: 'Название файла на Диске' },
        fileUrl: { type: 'string', description: 'Прямая ссылка на документ' },
        sheet: { type: 'string', description: 'Переопределить лист' },
        limit: { type: 'number', description: 'Максимум строк' },
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
        const file = link
          ? await resolveDocument(link, token)
          : await findCloudFile(
              provider,
              token,
              firstNonEmpty(ctx['fileName'], input.credentials['fileName']),
              folder,
            );

        return { ok: true, data: toFilePayload(file) };
      }

      if (input.action === 'append_row' || input.action === 'read_rows') {
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

        if (input.action === 'append_row') {
          if (sheet.rowCount === 0) {
            sheet.addRow(HEADERS);
          }

          const row = [
            firstNonEmpty(ctx['name'], ctx['from']),
            firstNonEmpty(ctx['phone']),
            firstNonEmpty(ctx['company'], ctx['subject']),
            ctx['amount'] ?? ctx['text'] ?? '',
            new Date().toISOString(),
          ];

          sheet.addRow(row);
          await uploadCloudFile(token, file, await workbookBuffer(workbook));

          return {
            ok: true,
            data: toFilePayload(file, { sheet: sheet.name, row }),
          };
        }

        const limit = Number(ctx['limit'] || 100);
        const rows: unknown[][] = [];

        sheet.eachRow((excelRow, index) => {
          if (index === 1 || rows.length >= limit) {
            return;
          }

          rows.push(excelRow.values as unknown[]);
        });

        return {
          ok: true,
          data: toFilePayload(file, { sheet: sheet.name, rows }),
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
