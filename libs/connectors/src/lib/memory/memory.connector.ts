import {
  Connector,
  ConnectorExecuteInput,
  ConnectorExecuteResult,
} from '../types';
import { interpolate, stringifyResult } from '../interpolate';

const stateError = 'Нет runtime.getState — memory работает только внутри запуска workflow';

export const memoryConnector: Connector = {
  id: 'memory',
  name: 'Memory',
  description:
    'Память workflow между запусками: последний intent, file_id голосового, offset. Подключение не нужно',
  credentialFields: [],
  actions: [
    {
      id: 'get',
      name: 'Прочитать',
      description: 'Вернуть значение по ключу. found=false, если пусто',
      paramsSchema: {
        key: { type: 'string', required: true, description: 'Ключ, можно {{item.chatId}}' },
      },
    },
    {
      id: 'set',
      name: 'Записать',
      description: 'Сохранить значение по ключу',
      paramsSchema: {
        key: { type: 'string', required: true, description: 'Ключ' },
        value: {
          type: 'string',
          description: 'Значение; иначе предыдущий шаг',
        },
      },
    },
  ],
  testConnection: async () => ({
    ok: true,
    message: 'Memory хранится в базе workflow, аккаунт не нужен',
  }),
  execute: async (
    input: ConnectorExecuteInput,
  ): Promise<ConnectorExecuteResult> => {
    const params = interpolate(
      input.params,
      input.context ?? input.previousResult,
    ) as Record<string, unknown>;
    const key = String(params['key'] || '').trim();

    if (!key) {
      return { ok: false, error: 'Укажите key' };
    }

    try {
      if (input.action === 'get') {
        if (!input.runtime?.getState) {
          return { ok: false, error: stateError };
        }

        const value = await input.runtime.getState(key);

        return {
          ok: true,
          data: {
            key,
            value: value ?? null,
            found: value != null,
          },
        };
      }

      if (input.action === 'set') {
        if (!input.runtime?.setState) {
          return { ok: false, error: stateError };
        }

        const value =
          params['value'] !== undefined
            ? params['value']
            : input.previousResult ?? stringifyResult(input.previousResult);

        await input.runtime.setState(key, value);

        return { ok: true, data: { key, value, saved: true } };
      }

      return { ok: false, error: `Неизвестное действие: ${input.action}` };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Memory connector error',
      };
    }
  },
};
