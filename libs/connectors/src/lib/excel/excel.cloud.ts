export type CloudProvider = 'google' | 'yandex' | 'url';

export interface CloudFile {
  id: string;
  name: string;
  mimeType: string;
  provider: CloudProvider;
  webUrl?: string;
}

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const GOOGLE_SHEET_MIME = 'application/vnd.google-apps.spreadsheet';

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const jsonError = (body: unknown, fallback: string) => {
  const record = asRecord(body);
  const nested = asRecord(record['error']);
  const message =
    (typeof nested['message'] === 'string' && nested['message']) ||
    (typeof record['message'] === 'string' && record['message']) ||
    (typeof record['description'] === 'string' && record['description']) ||
    fallback;

  return message;
};

const requestJson = async (
  url: string,
  init: RequestInit,
  fallback: string,
) => {
  const response = await fetch(url, init);
  const raw = await response.text();
  let body: unknown = {};

  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = { message: raw.slice(0, 280) };
    }
  }

  if (!response.ok) {
    throw new Error(jsonError(body, `${fallback} (HTTP ${response.status})`));
  }

  return body;
};

const requestBuffer = async (url: string, init: RequestInit, fallback: string) => {
  const response = await fetch(url, init);

  if (!response.ok) {
    const raw = await response.text();
    let body: unknown = {};

    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      body = { message: raw.slice(0, 280) };
    }

    throw new Error(jsonError(body, `${fallback} (HTTP ${response.status})`));
  }

  return Buffer.from(await response.arrayBuffer());
};

const normalizeName = (value: string) =>
  value.trim().toLowerCase().replace(/\.xlsx?$/i, '');

const isSpreadsheet = (name: string, mimeType = '') => {
  const lower = name.toLowerCase();
  const mime = mimeType.toLowerCase();

  return (
    lower.endsWith('.xlsx') ||
    lower.endsWith('.xls') ||
    lower.endsWith('.xlsm') ||
    mime.includes('spreadsheet') ||
    mime === XLSX_MIME ||
    mime === GOOGLE_SHEET_MIME
  );
};

const scoreFile = (fileName: string, query: string) => {
  const file = normalizeName(fileName);
  const needle = normalizeName(query);

  if (!needle) {
    return 99;
  }

  if (file === needle || fileName.trim().toLowerCase() === query.trim().toLowerCase()) {
    return 0;
  }

  if (file.startsWith(needle) || fileName.toLowerCase().includes(query.toLowerCase())) {
    return 1;
  }

  if (file.includes(needle)) {
    return 2;
  }

  return 99;
};

const pickBest = (files: CloudFile[], fileName: string): CloudFile => {
  const ranked = files
    .map((file) => ({ file, score: scoreFile(file.name, fileName) }))
    .filter((item) => item.score < 99)
    .sort((left, right) => left.score - right.score || left.file.name.localeCompare(right.file.name));

  if (ranked.length === 0) {
    throw new Error(`Файл «${fileName}» не найден на диске`);
  }

  return ranked[0].file;
};

const googleHeaders = (token: string): HeadersInit => ({
  Authorization: `Bearer ${token}`,
});

const yandexHeaders = (token: string): HeadersInit => ({
  Authorization: `OAuth ${token}`,
});

export const looksLikeUrl = (value: string) => /^https?:\/\//i.test(value.trim());

const fileNameFromUrl = (value: string) => {
  try {
    const path = new URL(value).pathname.split('/').filter(Boolean).pop() || '';

    return decodeURIComponent(path) || 'document.xlsx';
  } catch {
    return 'document.xlsx';
  }
};

export const parseDocumentUrl = (raw: string): CloudFile => {
  const url = raw.trim();

  if (!looksLikeUrl(url)) {
    throw new Error('Укажите прямую ссылку на документ');
  }

  const sheet = url.match(
    /docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/i,
  );

  if (sheet?.[1]) {
    return {
      id: sheet[1],
      name: 'spreadsheet.xlsx',
      mimeType: GOOGLE_SHEET_MIME,
      provider: 'google',
      webUrl: url,
    };
  }

  const driveFile = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
  const driveQuery = url.match(
    /drive\.google\.com\/.*[?&](?:id|ids)=([a-zA-Z0-9_-]+)/i,
  );
  const driveId = driveFile?.[1] || driveQuery?.[1];

  if (driveId) {
    return {
      id: driveId,
      name: fileNameFromUrl(url),
      mimeType: XLSX_MIME,
      provider: 'google',
      webUrl: url,
    };
  }

  if (/disk\.yandex\.(ru|com)|yadi\.sk|yandex\.(ru|com)\/disk/i.test(url)) {
    return {
      id: url,
      name: fileNameFromUrl(url),
      mimeType: XLSX_MIME,
      provider: 'yandex',
      webUrl: url,
    };
  }

  return {
    id: url,
    name: fileNameFromUrl(url),
    mimeType: XLSX_MIME,
    provider: 'url',
    webUrl: url,
  };
};

const parseProvider = (value: string | undefined): CloudProvider => {
  const raw = (value || 'yandex').trim().toLowerCase();

  if (raw === 'google' || raw === 'gdrive' || raw === 'google_drive') {
    return 'google';
  }

  if (raw === 'url' || raw === 'link' || raw === 'ссылка') {
    return 'url';
  }

  if (
    raw === 'yandex' ||
    raw === 'yadisk' ||
    raw === 'яндекс' ||
    raw === ''
  ) {
    return 'yandex';
  }

  throw new Error(
    'Укажите хранилище: Google Drive, Яндекс Диск или прямую ссылку',
  );
};

export const resolveDocument = async (
  url: string,
  token?: string,
): Promise<CloudFile> => {
  const parsed = parseDocumentUrl(url);

  if (parsed.provider === 'google' && token) {
    try {
      const body = asRecord(
        await requestJson(
          `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(parsed.id)}?fields=id,name,mimeType,webViewLink`,
          { headers: googleHeaders(token) },
          'Не удалось открыть файл Google Drive',
        ),
      );

      return {
        id: String(body['id'] || parsed.id),
        name: String(body['name'] || parsed.name),
        mimeType: String(body['mimeType'] || parsed.mimeType),
        provider: 'google',
        webUrl:
          (typeof body['webViewLink'] === 'string' && body['webViewLink']) ||
          parsed.webUrl,
      };
    } catch {
      return parsed;
    }
  }

  if (parsed.provider === 'yandex') {
    const publicKey = encodeURIComponent(parsed.webUrl || parsed.id);
    const body = asRecord(
      await requestJson(
        `https://cloud-api.yandex.net/v1/disk/public/resources?public_key=${publicKey}&fields=name,path,mime_type,type`,
        token ? { headers: yandexHeaders(token) } : {},
        'Не удалось открыть ссылку Яндекс Диска',
      ),
    );
    const path = typeof body['path'] === 'string' ? body['path'] : '';

    return {
      id: path || parsed.id,
      name: String(body['name'] || parsed.name),
      mimeType: String(body['mime_type'] || parsed.mimeType),
      provider: 'yandex',
      webUrl: parsed.webUrl,
    };
  }

  return parsed;
};

export const testCloud = async (
  provider: CloudProvider,
  token: string,
  fileUrl?: string,
): Promise<string> => {
  if (fileUrl || provider === 'url') {
    if (!fileUrl) {
      throw new Error('Укажите прямую ссылку на документ');
    }

    const file = await resolveDocument(fileUrl, token);
    await downloadCloudFile(token, file);

    return `Документ доступен: ${file.name}`;
  }

  if (!token) {
    throw new Error('Укажите OAuth-токен или прямую ссылку на документ');
  }

  if (provider === 'google') {
    const body = asRecord(
      await requestJson(
        'https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)',
        { headers: googleHeaders(token) },
        'Google Drive недоступен',
      ),
    );
    const user = asRecord(body['user']);
    const who =
      (typeof user['emailAddress'] === 'string' && user['emailAddress']) ||
      (typeof user['displayName'] === 'string' && user['displayName']) ||
      'ok';

    return `Google Drive: ${who}`;
  }

  const body = asRecord(
    await requestJson(
      'https://cloud-api.yandex.net/v1/disk/',
      { headers: yandexHeaders(token) },
      'Яндекс Диск недоступен',
    ),
  );
  const user = asRecord(body['user']);
  const who =
    (typeof user['display_name'] === 'string' && user['display_name']) ||
    (typeof user['login'] === 'string' && user['login']) ||
    'ok';

  return `Яндекс Диск: ${who}`;
};

const listGoogle = async (
  token: string,
  fileName: string,
  folder?: string,
): Promise<CloudFile[]> => {
  const escaped = fileName.replace(/'/g, "\\'");
  const clauses = [
    `name contains '${escaped}'`,
    'trashed = false',
    `(mimeType = '${XLSX_MIME}' or mimeType = '${GOOGLE_SHEET_MIME}' or mimeType = 'application/vnd.ms-excel')`,
  ];

  if (folder) {
    clauses.push(`'${folder.replace(/'/g, "\\'")}' in parents`);
  }

  const url = new URL('https://www.googleapis.com/drive/v3/files');
  url.searchParams.set('q', clauses.join(' and '));
  url.searchParams.set('pageSize', '25');
  url.searchParams.set('fields', 'files(id,name,mimeType,webViewLink)');

  const body = asRecord(
    await requestJson(
      url.toString(),
      { headers: googleHeaders(token) },
      'Не удалось найти файл на Google Drive',
    ),
  );
  const files = Array.isArray(body['files']) ? body['files'] : [];

  return files
    .map((item) => {
      const file = asRecord(item);

      return {
        id: String(file['id'] || ''),
        name: String(file['name'] || ''),
        mimeType: String(file['mimeType'] || ''),
        provider: 'google' as const,
        webUrl:
          typeof file['webViewLink'] === 'string' ? file['webViewLink'] : undefined,
      };
    })
    .filter((file) => file.id && isSpreadsheet(file.name, file.mimeType));
};

const listYandex = async (
  token: string,
  folder?: string,
): Promise<CloudFile[]> => {
  const url = new URL('https://cloud-api.yandex.net/v1/disk/resources/files');
  url.searchParams.set('limit', '200');
  url.searchParams.set(
    'fields',
    'items.name,items.path,items.mime_type,items.media_type',
  );

  const body = asRecord(
    await requestJson(
      url.toString(),
      { headers: yandexHeaders(token) },
      'Не удалось получить список файлов Яндекс Диска',
    ),
  );
  const items = Array.isArray(body['items']) ? body['items'] : [];
  const prefix = folder
    ? folder.startsWith('disk:')
      ? folder.replace(/\/+$/, '')
      : `disk:/${folder.replace(/^\/+/, '').replace(/\/+$/, '')}`
    : '';

  return items
    .map((item) => {
      const file = asRecord(item);
      const path = String(file['path'] || '');
      const name = String(file['name'] || '');
      const mime = String(file['mime_type'] || '');
      const media = String(file['media_type'] || '');

      return {
        id: path,
        name,
        mimeType: mime || media,
        provider: 'yandex' as const,
      };
    })
    .filter((file) => {
      if (!file.id || !isSpreadsheet(file.name, file.mimeType)) {
        return false;
      }

      if (!prefix) {
        return true;
      }

      return file.id === prefix || file.id.startsWith(`${prefix}/`);
    });
};

export const findCloudFile = async (
  provider: CloudProvider,
  token: string,
  fileName: string,
  folder?: string,
): Promise<CloudFile> => {
  if (looksLikeUrl(fileName)) {
    return resolveDocument(fileName, token);
  }

  const query = fileName.trim();

  if (!query) {
    throw new Error('Укажите название Excel-файла или прямую ссылку');
  }

  if (provider === 'url') {
    throw new Error('Для прямой ссылки укажите fileUrl, а не имя файла');
  }

  if (!token) {
    throw new Error('Укажите OAuth-токен или прямую ссылку на документ');
  }

  const files =
    provider === 'google'
      ? await listGoogle(token, query, folder)
      : await listYandex(token, folder);

  return pickBest(files, query);
};

const isXlsxBuffer = (buffer: Buffer) =>
  buffer.length >= 2 && buffer[0] === 0x50 && buffer[1] === 0x4b;

const downloadPublicGoogle = async (file: CloudFile) => {
  const url =
    file.mimeType === GOOGLE_SHEET_MIME
      ? `https://docs.google.com/spreadsheets/d/${encodeURIComponent(file.id)}/export?format=xlsx`
      : `https://drive.google.com/uc?export=download&id=${encodeURIComponent(file.id)}&confirm=t`;
  const buffer = await requestBuffer(
    url,
    {},
    'Не удалось скачать документ по ссылке Google',
  );

  if (!isXlsxBuffer(buffer)) {
    throw new Error(
      'Google не отдал файл. Откройте доступ по ссылке или подключите Google Drive.',
    );
  }

  return buffer;
};

const downloadPublicYandex = async (file: CloudFile) => {
  const publicKey = encodeURIComponent(file.webUrl || file.id);
  const body = asRecord(
    await requestJson(
      `https://cloud-api.yandex.net/v1/disk/public/resources/download?public_key=${publicKey}`,
      {},
      'Не удалось получить ссылку на скачивание',
    ),
  );
  const href = String(body['href'] || '');

  if (!href) {
    throw new Error('Яндекс Диск не вернул ссылку на скачивание');
  }

  return requestBuffer(href, {}, 'Не удалось скачать файл по ссылке Яндекс Диска');
};

export const downloadCloudFile = async (
  token: string,
  file: CloudFile,
): Promise<Buffer> => {
  if (file.provider === 'url') {
    const buffer = await requestBuffer(
      file.webUrl || file.id,
      {},
      'Не удалось скачать документ по ссылке',
    );

    if (!isXlsxBuffer(buffer)) {
      throw new Error(
        'По ссылке нет Excel-файла. Нужна прямая ссылка на .xlsx или доступный документ.',
      );
    }

    return buffer;
  }

  if (file.provider === 'google') {
    if (!token) {
      return downloadPublicGoogle(file);
    }

    const url =
      file.mimeType === GOOGLE_SHEET_MIME
        ? `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}/export?mimeType=${encodeURIComponent(XLSX_MIME)}`
        : `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(file.id)}?alt=media`;

    return requestBuffer(
      url,
      { headers: googleHeaders(token) },
      'Не удалось скачать файл с Google Drive',
    );
  }

  if (!token || looksLikeUrl(file.id)) {
    return downloadPublicYandex(file);
  }

  const body = asRecord(
    await requestJson(
      `https://cloud-api.yandex.net/v1/disk/resources/download?path=${encodeURIComponent(file.id)}`,
      { headers: yandexHeaders(token) },
      'Не удалось получить ссылку на скачивание',
    ),
  );
  const href = String(body['href'] || '');

  if (!href) {
    throw new Error('Яндекс Диск не вернул ссылку на скачивание');
  }

  return requestBuffer(href, {}, 'Не удалось скачать файл с Яндекс Диска');
};

export const uploadCloudFile = async (
  token: string,
  file: CloudFile,
  buffer: Buffer,
): Promise<void> => {
  if (file.provider === 'url' || !token) {
    throw new Error(
      'Запись по прямой ссылке недоступна. Подключите Google Drive или Яндекс Диск.',
    );
  }

  if (file.provider === 'google') {
    if (file.mimeType === GOOGLE_SHEET_MIME) {
      throw new Error(
        'Запись в нативную Google Таблицу не поддерживается. Сохраните файл как .xlsx на Диске.',
      );
    }

    const response = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(file.id)}?uploadType=media`,
      {
        method: 'PATCH',
        headers: {
          ...googleHeaders(token),
          'Content-Type': XLSX_MIME,
        },
        body: buffer as never,
      },
    );

    if (!response.ok) {
      const raw = await response.text();
      let parsed: unknown = {};

      try {
        parsed = raw ? JSON.parse(raw) : {};
      } catch {
        parsed = { message: raw.slice(0, 280) };
      }

      throw new Error(
        jsonError(parsed, 'Не удалось загрузить файл на Google Drive'),
      );
    }

    return;
  }

  if (looksLikeUrl(file.id)) {
    throw new Error(
      'Запись по публичной ссылке Яндекс Диска недоступна. Подключите Диск с OAuth-токеном.',
    );
  }

  const body = asRecord(
    await requestJson(
      `https://cloud-api.yandex.net/v1/disk/resources/upload?path=${encodeURIComponent(file.id)}&overwrite=true`,
      { headers: yandexHeaders(token) },
      'Не удалось получить ссылку на загрузку',
    ),
  );
  const href = String(body['href'] || '');
  const method = String(body['method'] || 'PUT').toUpperCase();

  if (!href) {
    throw new Error('Яндекс Диск не вернул ссылку на загрузку');
  }

  const response = await fetch(href, {
    method,
    headers: { 'Content-Type': XLSX_MIME },
    body: buffer as never,
  });

  if (!response.ok) {
    throw new Error(
      `Не удалось загрузить файл на Яндекс Диск (HTTP ${response.status})`,
    );
  }
};

export const resolveCloud = (credentials: Record<string, string>) => {
  const fileUrl = (credentials['fileUrl'] || '').trim() || undefined;
  const provider = parseProvider(credentials['provider']);
  const token = (credentials['accessToken'] || '').trim();
  const folder = (credentials['folder'] || '').trim() || undefined;

  if (provider === 'url' && !fileUrl) {
    throw new Error('Укажите прямую ссылку на документ');
  }

  if (provider !== 'url' && !token && !fileUrl) {
    throw new Error('Укажите OAuth-токен или прямую ссылку на документ');
  }

  return { provider, token, folder, fileUrl };
};
