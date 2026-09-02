export type TelegramMessage = {
  chatId: string;
  userId: string;
  username: string;
  text: string;
  messageId: number | null;
  voiceFileId: string;
  isVoice: boolean;
  date?: number;
  message?: Record<string, unknown>;
  updateId?: number;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const nested = (value: unknown, key: string): Record<string, unknown> =>
  asRecord(asRecord(value)[key]);

export const normalizeTelegramMessage = (
  payload: unknown,
): TelegramMessage | null => {
  const root = asRecord(payload);
  const message = asRecord(
    root['message'] ||
      root['edited_message'] ||
      nested(root['callback_query'], 'message') ||
      (root['chat'] ? root : null),
  );

  const callback = asRecord(root['callback_query']);
  const chat = asRecord(message['chat'] || root['chat']);
  const from = asRecord(message['from'] || root['from'] || callback['from']);
  const voice = asRecord(message['voice'] || message['audio']);
  const chatId = String(chat['id'] ?? root['chatId'] ?? '');

  if (!chatId) {
    return null;
  }

  const text = String(
    message['text'] ||
      message['caption'] ||
      root['text'] ||
      callback['data'] ||
      '',
  );
  const voiceFileId = String(voice['file_id'] || root['voiceFileId'] || '');

  return {
    chatId,
    userId: String(from['id'] || ''),
    username: String(from['username'] || from['first_name'] || ''),
    text,
    messageId:
      typeof message['message_id'] === 'number'
        ? message['message_id']
        : typeof root['messageId'] === 'number'
          ? root['messageId']
          : null,
    voiceFileId,
    isVoice: Boolean(voiceFileId),
    date: typeof message['date'] === 'number' ? message['date'] : undefined,
    message: Object.keys(message).length ? message : undefined,
    updateId:
      typeof root['update_id'] === 'number' ? root['update_id'] : undefined,
  };
};

export const looksLikeTelegramUpdate = (payload: unknown): boolean =>
  Boolean(normalizeTelegramMessage(payload));

export const flattenTelegramInput = (
  payload: unknown,
): Record<string, unknown> => {
  const root = asRecord(payload);
  const normalized = normalizeTelegramMessage(payload);

  if (!normalized) {
    return root;
  }

  return {
    ...root,
    ...normalized,
  };
};
