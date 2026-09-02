import {
  Connector,
  ConnectorExecuteInput,
  ConnectorExecuteResult,
} from '../types';
import {
  asRecord,
  firstNonEmpty,
  interpolate,
  stringifyResult,
} from '../interpolate';
import { bufferFromPrevious, speakText, transcribeAudio } from '../llm/audio';
import { downloadTelegramFile, telegramCall, telegramUpload } from './api';
import {
  normalizeTelegramMessage,
  type TelegramMessage,
} from './normalize';

const resolveChatId = (
  params: Record<string, unknown>,
  credentials: Record<string, string>,
  input: ConnectorExecuteInput,
): string => {
  const fromInput = asRecord(input.context?.input);
  const fromPrevious = asRecord(input.previousResult);

  return firstNonEmpty(
    params['chatId'],
    credentials['chatId'],
    fromInput['chatId'],
    fromPrevious['chatId'],
  );
};

const transcribeMessage = async (
  token: string,
  item: TelegramMessage,
  credentials: Record<string, string>,
): Promise<TelegramMessage> => {
  if (!item.voiceFileId || item.text.trim()) {
    return item;
  }

  try {
    const file = await downloadTelegramFile(token, item.voiceFileId);
    const text = await transcribeAudio({
      buffer: file.buffer,
      filename: 'voice.ogg',
      mimeType: file.mimeType,
      credentials,
    });

    return { ...item, text };
  } catch {
    return item;
  }
};

const sendVoiceBuffer = async (
  token: string,
  chatId: string,
  buffer: Buffer,
) => {
  const form = new FormData();
  form.append('chat_id', chatId);
  form.append(
    'voice',
    new Blob([new Uint8Array(buffer)], { type: 'audio/ogg' }),
    'voice.ogg',
  );

  return telegramUpload<{ voice?: { file_id?: string } }>(
    token,
    'sendVoice',
    form,
  );
};

export const telegramConnector: Connector = {
  id: 'telegram',
  name: 'Telegram',
  description:
    'Входящие обновления, текст и голосовые. Chat ID в подключении — для исходящих отчётов, для диалога берётся из сообщения',
  credentialFields: [
    {
      key: 'botToken',
      label: 'Токен бота',
      secret: true,
      placeholder: '123456:ABC...',
    },
    {
      key: 'chatId',
      label: 'Chat ID (необязательно для входящих)',
      placeholder: '123456789',
    },
  ],
  actions: [
    {
      id: 'get_updates',
      name: 'Получить входящие',
      description:
        'Новые сообщения бота (long poll) или уже пришедший webhook. Голос можно расшифровать',
      paramsSchema: {
        transcribe: {
          type: 'boolean',
          description: 'Распознать голосовые в текст',
        },
        limit: { type: 'number', description: 'Максимум обновлений' },
      },
    },
    {
      id: 'send_message',
      name: 'Отправить сообщение',
      description: 'Текст в чат. chatId можно взять из {{item.chatId}}',
      paramsSchema: {
        text: {
          type: 'string',
          description: 'Текст. Можно {{previous}} или {{item.text}}',
        },
        chatId: {
          type: 'string',
          description: 'Переопределить chat_id, для диалога {{item.chatId}}',
        },
        skipIfEmpty: {
          type: 'boolean',
          description: 'Не отправлять, если предыдущий список пуст',
        },
      },
    },
    {
      id: 'send_voice',
      name: 'Отправить голосовое',
      description:
        'fileId, audio с предыдущего шага или TTS из text. memoryKey запоминает file_id — повторный вопрос шлёт то же голосовое',
      paramsSchema: {
        chatId: { type: 'string', description: '{{item.chatId}}' },
        fileId: {
          type: 'string',
          description: 'Уже загруженный voice file_id',
        },
        text: {
          type: 'string',
          description: 'Озвучить этот текст, если нет fileId/аудио',
        },
        memoryKey: {
          type: 'string',
          description: 'Ключ кэша, например voice:{{item.chatId}}:{{previous.label}}',
        },
        voice: { type: 'string', description: 'Голос OpenAI TTS, по умолчанию alloy' },
        skipIfEmpty: { type: 'boolean', description: 'Пропустить, если нечего слать' },
      },
    },
  ],
  testConnection: async (credentials) => {
    const token = credentials['botToken'];

    if (!token) {
      return { ok: false, error: 'Укажите токен бота' };
    }

    try {
      const body = await telegramCall<{ username?: string }>(token, 'getMe');

      if (!body.ok) {
        return { ok: false, error: body.description || 'Telegram getMe failed' };
      }

      return { ok: true, message: `Бот @${body.result?.username ?? 'ok'}` };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error ? error.message : 'Telegram connection failed',
      };
    }
  },
  execute: async (
    input: ConnectorExecuteInput,
  ): Promise<ConnectorExecuteResult> => {
    const params = interpolate(
      input.params,
      input.context ?? input.previousResult,
    ) as Record<string, unknown>;
    const token = input.credentials['botToken'];

    if (!token) {
      return { ok: false, error: 'Не задан botToken' };
    }

    try {
      if (input.action === 'get_updates') {
        const transcribe =
          params['transcribe'] === true || params['transcribe'] === 'true';
        const limit = Math.min(Math.max(Number(params['limit'] || 20) || 20, 1), 100);
        const fromHook = normalizeTelegramMessage(input.context?.input);

        if (fromHook) {
          const item = transcribe
            ? await transcribeMessage(token, fromHook, input.credentials)
            : fromHook;

          return {
            ok: true,
            data: { count: 1, messages: [item], items: [item], source: 'webhook' },
          };
        }

        const stored = await input.runtime?.getState?.('telegram:offset');
        const offset = Number(params['offset'] ?? stored ?? 0) || 0;
        const body = await telegramCall<Array<Record<string, unknown>>>(
          token,
          'getUpdates',
          {
            offset,
            timeout: 0,
            limit,
            allowed_updates: ['message', 'edited_message', 'callback_query'],
          },
        );

        if (!body.ok) {
          return {
            ok: false,
            error: body.description || 'Telegram getUpdates failed',
          };
        }

        const updates = body.result ?? [];
        const messages: TelegramMessage[] = [];

        for (const update of updates) {
          const item = normalizeTelegramMessage(update);

          if (!item) {
            continue;
          }

          messages.push(
            transcribe
              ? await transcribeMessage(token, item, input.credentials)
              : item,
          );
        }

        const lastId = updates.reduce((max, update) => {
          const id = Number(update['update_id'] || 0);
          return id > max ? id : max;
        }, offset - 1);
        const nextOffset = lastId >= 0 ? lastId + 1 : offset;

        if (input.runtime?.setState && nextOffset !== offset) {
          await input.runtime.setState('telegram:offset', nextOffset);
        }

        const first = messages[0];

        return {
          ok: true,
          data: {
            count: messages.length,
            messages,
            items: messages,
            nextOffset,
            source: 'poll',
            chatId: first?.chatId,
            text: first?.text,
          },
        };
      }

      if (input.action === 'send_message') {
        const chatId = resolveChatId(params, input.credentials, input);
        const text = String(
          params['text'] || stringifyResult(input.previousResult) || 'Готово',
        );

        if (!chatId) {
          return { ok: false, error: 'Не задан chatId' };
        }

        const body = await telegramCall(token, 'sendMessage', {
          chat_id: chatId,
          text: text.slice(0, 4000),
        });

        if (!body.ok) {
          return {
            ok: false,
            error: body.description || 'Telegram sendMessage failed',
          };
        }

        return { ok: true, data: { chatId, sent: true, text } };
      }

      if (input.action === 'send_voice') {
        const chatId = resolveChatId(params, input.credentials, input);

        if (!chatId) {
          return { ok: false, error: 'Не задан chatId' };
        }

        const memoryKey = firstNonEmpty(params['memoryKey']);
        const cached = memoryKey
          ? await input.runtime?.getState?.(memoryKey)
          : undefined;
        const cachedId =
          typeof cached === 'string'
            ? cached
            : firstNonEmpty(asRecord(cached)['fileId']);
        const fileId = firstNonEmpty(params['fileId'], cachedId);
        let usedFileId = fileId;
        let cachedHit = Boolean(cachedId) && cachedId === fileId;

        if (fileId) {
          const body = await telegramCall(token, 'sendVoice', {
            chat_id: chatId,
            voice: fileId,
          });

          if (!body.ok) {
            if (!cachedHit) {
              return {
                ok: false,
                error: body.description || 'Telegram sendVoice failed',
              };
            }

            usedFileId = '';
            cachedHit = false;
          } else {
            return {
              ok: true,
              data: { chatId, sent: true, fileId, cached: cachedHit },
            };
          }
        }

        let buffer = bufferFromPrevious(input.previousResult);

        if (!buffer && firstNonEmpty(params['audioBase64'])) {
          buffer = Buffer.from(String(params['audioBase64']), 'base64');
        }

        if (!buffer) {
          const text = firstNonEmpty(
            params['text'],
            asRecord(input.previousResult)['text'],
          );

          if (!text) {
            return { ok: false, error: 'Нет fileId, аудио или text для озвучки' };
          }

          const spoken = await speakText({
            text,
            voice: firstNonEmpty(params['voice']),
            credentials: input.credentials,
          });
          buffer = spoken.buffer;
        }

        const uploaded = await sendVoiceBuffer(token, chatId, buffer);

        if (!uploaded.ok) {
          return {
            ok: false,
            error: uploaded.description || 'Telegram sendVoice failed',
          };
        }

        usedFileId = uploaded.result?.voice?.file_id || usedFileId;

        if (memoryKey && usedFileId && input.runtime?.setState) {
          await input.runtime.setState(memoryKey, usedFileId);
        }

        return {
          ok: true,
          data: { chatId, sent: true, fileId: usedFileId, cached: false },
        };
      }

      return { ok: false, error: `Неизвестное действие: ${input.action}` };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error ? error.message : 'Telegram connector error',
      };
    }
  },
};
