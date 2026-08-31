import {
  Connector,
  ConnectorExecuteInput,
  ConnectorExecuteResult,
} from '../types';
import { firstNonEmpty, mergeContext } from '../interpolate';

const basicAuthHeader = (username: string, password: string): string =>
  `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

const joinUrl = (base: string, path: string): string => {
  const normalizedBase = base.replace(/\/+$/, '');
  const normalizedPath = path.replace(/^\/+/, '');

  if (!normalizedPath) {
    return normalizedBase;
  }

  return `${normalizedBase}/${normalizedPath}`;
};

export const oneCConnector: Connector = {
  id: 'onec',
  name: '1С',
  description: 'HTTP/OData: создание записи в опубликованной базе 1С',
  credentialFields: [
    {
      key: 'baseUrl',
      label: 'URL HTTP/OData',
      placeholder: 'https://1c.example.com/base/odata/standard.odata',
    },
    { key: 'username', label: 'Логин' },
    { key: 'password', label: 'Пароль', secret: true },
    {
      key: 'resource',
      label: 'Ресурс (каталог/HTTP-сервис)',
      placeholder: 'Catalog_Контрагенты',
    },
  ],
  actions: [
    {
      id: 'create_record',
      name: 'Создать запись',
      description: 'POST JSON из извлечённых полей в ресурс 1С',
      paramsSchema: {
        resource: { type: 'string', description: 'Переопределить ресурс' },
        body: {
          type: 'object',
          description: 'Тело запроса; иначе поля предыдущего шага',
        },
      },
    },
  ],
  testConnection: async (credentials) => {
    const baseUrl = credentials['baseUrl'];

    if (!baseUrl) {
      return { ok: false, error: 'Укажите baseUrl опубликованного HTTP/OData' };
    }

    try {
      const url = joinUrl(baseUrl, '$metadata');
      const response = await fetch(url, {
        headers: {
          Authorization: basicAuthHeader(
            credentials['username'] || '',
            credentials['password'] || '',
          ),
        },
      });

      if (!response.ok) {
        const fallback = await fetch(baseUrl, {
          headers: {
            Authorization: basicAuthHeader(
              credentials['username'] || '',
              credentials['password'] || '',
            ),
          },
        });

        if (!fallback.ok) {
          return {
            ok: false,
            error: `1С ответила ${response.status}. Проверьте URL, логин и публикацию HTTP/OData.`,
          };
        }
      }

      return { ok: true, message: '1С HTTP/OData доступен' };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : '1C connection failed',
      };
    }
  },
  execute: async (
    input: ConnectorExecuteInput,
  ): Promise<ConnectorExecuteResult> => {
    try {
      if (input.action !== 'create_record') {
        return { ok: false, error: `Неизвестное действие: ${input.action}` };
      }

      const ctx = mergeContext(
        input.params,
        input.previousResult,
        input.context,
      );
      const resource = String(
        ctx['resource'] || input.credentials['resource'] || '',
      );
      const baseUrl = input.credentials['baseUrl'];

      if (!baseUrl) {
        return { ok: false, error: 'Не задан baseUrl 1С' };
      }

      if (!resource) {
        return { ok: false, error: 'Не задан resource 1С' };
      }

      const body =
        ctx['body'] && typeof ctx['body'] === 'object'
          ? ctx['body']
          : {
              Description: firstNonEmpty(
                ctx['name'],
                ctx['company'],
                ctx['subject'],
              ),
              Name: firstNonEmpty(ctx['name']),
              Phone: firstNonEmpty(ctx['phone']),
              Company: firstNonEmpty(ctx['company']),
              Amount: ctx['amount'] ?? null,
            };

      const url = joinUrl(baseUrl, resource);
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: basicAuthHeader(
            input.credentials['username'] || '',
            input.credentials['password'] || '',
          ),
        },
        body: JSON.stringify(body),
      });
      const text = await response.text();
      let parsed: unknown = text;

      try {
        parsed = text ? JSON.parse(text) : null;
      } catch {
        parsed = text;
      }

      if (!response.ok) {
        return {
          ok: false,
          error: `1С ${response.status}: ${typeof parsed === 'string' ? parsed : JSON.stringify(parsed)}`,
        };
      }

      return {
        ok: true,
        data: { url, status: response.status, record: parsed, posted: body },
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : '1C connector error',
      };
    }
  },
};
