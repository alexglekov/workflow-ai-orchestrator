import {
  Connector,
  ConnectorExecuteInput,
  ConnectorExecuteResult,
} from '../types';
import { interpolate, stringifyResult } from '../interpolate';

export const telegramConnector: Connector = {
  id: 'telegram',
  name: 'Telegram',
  description: 'Отправка сообщений через Telegram Bot API',
  credentialFields: [
    {
      key: 'botToken',
      label: 'Токен бота',
      secret: true,
      placeholder: '123456:ABC...',
    },
    { key: 'chatId', label: 'Chat ID', placeholder: '123456789' },
  ],
  actions: [
    {
      id: 'send_message',
      name: 'Отправить сообщение',
      description: 'Текст из параметров или результат предыдущего шага',
      paramsSchema: {
        text: {
          type: 'string',
          description: 'Текст. Можно {{previous}} или {{previous.name}}',
        },
        chatId: { type: 'string', description: 'Переопределить chat_id' },
      },
    },
  ],
  testConnection: async (credentials) => {
    const token = credentials['botToken'];

    if (!token) {
      return { ok: false, error: 'Укажите токен бота' };
    }

    try {
      const response = await fetch(
        `https://api.telegram.org/bot${token}/getMe`,
      );
      const body = (await response.json()) as {
        ok?: boolean;
        description?: string;
        result?: { username?: string };
      };

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
    try {
      if (input.action !== 'send_message') {
        return { ok: false, error: `Неизвестное действие: ${input.action}` };
      }

      const params = interpolate(input.params, input.previousResult) as Record<
        string,
        unknown
      >;
      const token = input.credentials['botToken'];
      const chatId = String(
        params['chatId'] || input.credentials['chatId'] || '',
      );
      const text = String(
        params['text'] || stringifyResult(input.previousResult) || 'Готово',
      );

      if (!token) {
        return { ok: false, error: 'Не задан botToken' };
      }

      if (!chatId) {
        return { ok: false, error: 'Не задан chatId' };
      }

      const response = await fetch(
        `https://api.telegram.org/bot${token}/sendMessage`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 4000) }),
        },
      );
      const body = (await response.json()) as {
        ok?: boolean;
        description?: string;
      };

      if (!body.ok) {
        return {
          ok: false,
          error: body.description || 'Telegram sendMessage failed',
        };
      }

      return { ok: true, data: { chatId, sent: true, text } };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error ? error.message : 'Telegram connector error',
      };
    }
  },
};
