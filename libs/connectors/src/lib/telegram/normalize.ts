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
  businessConnectionId?: string;
};

export type TelegramBusinessConnection = {
  id: string;
  userId: string;
  userChatId: string;
  username: string;
  firstName: string;
  canReply: boolean;
  isEnabled: boolean;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const nested = (value: unknown, key: string): Record<string, unknown> =>
  asRecord(asRecord(value)[key]);

const canReplyFrom = (raw: Record<string, unknown>): boolean => {
  if (raw['can_reply'] === true) {
    return true;
  }

  const rights = asRecord(raw['rights']);

  return (
    rights['can_reply'] === true || rights['can_reply_to_messages'] === true
  );
};

export const parseBusinessConnection = (
  payload: unknown,
): TelegramBusinessConnection | null => {
  const root = asRecord(payload);
  const wrapped = asRecord(root['business_connection']);
  const raw =
    wrapped['id'] || wrapped['user']
      ? wrapped
      : root['id'] && (root['user'] || root['user_chat_id'])
        ? root
        : {};
  const id = String(raw['id'] || '');

  if (!id) {
    return null;
  }

  const user = asRecord(raw['user']);

  return {
    id,
    userId: String(user['id'] || raw['user_chat_id'] || ''),
    userChatId: String(raw['user_chat_id'] || user['id'] || ''),
    username: String(user['username'] || ''),
    firstName: String(user['first_name'] || ''),
    canReply: canReplyFrom(raw),
    isEnabled: raw['is_enabled'] !== false,
  };
};

export const normalizeTelegramMessage = (
  payload: unknown,
): TelegramMessage | null => {
  const root = asRecord(payload);
  const message = asRecord(
    root['business_message'] ||
      root['edited_business_message'] ||
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
  const businessConnectionId = String(
    message['business_connection_id'] ||
      root['business_connection_id'] ||
      root['businessConnectionId'] ||
      '',
  );

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
    ...(businessConnectionId ? { businessConnectionId } : {}),
  };
};

export const looksLikeTelegramUpdate = (payload: unknown): boolean =>
  Boolean(normalizeTelegramMessage(payload) || parseBusinessConnection(payload));

export const flattenTelegramInput = (
  payload: unknown,
): Record<string, unknown> => {
  const root = asRecord(payload);
  const normalized = normalizeTelegramMessage(payload);
  const business = parseBusinessConnection(payload);

  if (!normalized && !business) {
    return root;
  }

  return {
    ...root,
    ...(normalized ?? {}),
    ...(business ? { businessConnectionId: business.id } : {}),
  };
};
