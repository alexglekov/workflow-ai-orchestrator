export type TelegramApiResult<T> = {
  ok: boolean;
  description?: string;
  result?: T;
};

export const telegramCall = async <T>(
  token: string,
  method: string,
  payload?: Record<string, unknown>,
): Promise<TelegramApiResult<T>> => {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload ? JSON.stringify(payload) : undefined,
    signal: AbortSignal.timeout(20_000),
  });

  return (await response.json()) as TelegramApiResult<T>;
};

export const telegramUpload = async <T>(
  token: string,
  method: string,
  form: FormData,
): Promise<TelegramApiResult<T>> => {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    body: form,
    signal: AbortSignal.timeout(60_000),
  });

  return (await response.json()) as TelegramApiResult<T>;
};

export const downloadTelegramFile = async (
  token: string,
  fileId: string,
): Promise<{ buffer: Buffer; filePath: string; mimeType: string }> => {
  const meta = await telegramCall<{ file_path?: string }>(token, 'getFile', {
    file_id: fileId,
  });

  if (!meta.ok || !meta.result?.file_path) {
    throw new Error(meta.description || 'Не удалось получить file_path');
  }

  const filePath = meta.result.file_path;
  const response = await fetch(
    `https://api.telegram.org/file/bot${token}/${filePath}`,
    { signal: AbortSignal.timeout(30_000) },
  );

  if (!response.ok) {
    throw new Error(`Скачивание файла Telegram: HTTP ${response.status}`);
  }

  return {
    buffer: Buffer.from(await response.arrayBuffer()),
    filePath,
    mimeType: response.headers.get('content-type') || 'application/octet-stream',
  };
};
