import {
  Connector,
  ConnectorExecuteInput,
  ConnectorExecuteResult,
} from '../types';
import { firstNonEmpty, interpolate, mergeContext } from '../interpolate';
import {
  basicAuthHeader,
  buildFilter,
  joinUrl,
  odataError,
  parseODataJson,
  queryString,
  recordsFromOData,
  resourceWithKey,
  stripODataMeta,
} from './odata';

const RESERVED = new Set([
  'resource',
  'key',
  'keyField',
  'filter',
  'field',
  'op',
  'value',
  'filters',
  'select',
  'top',
  'skip',
  'orderby',
  'expand',
  'body',
  'url',
  'status',
  'record',
  'records',
  'items',
  'rows',
  'count',
  'posted',
  'patched',
]);

const authHeaders = (credentials: Record<string, string>) => ({
  Authorization: basicAuthHeader(
    credentials['username'] || '',
    credentials['password'] || '',
  ),
  Accept: 'application/json',
});

const resolveResource = (
  ctx: Record<string, unknown>,
  credentials: Record<string, string>,
): string =>
  firstNonEmpty(ctx['resource'], credentials['resource']);

const resolveKey = (ctx: Record<string, unknown>): unknown => {
  if (ctx['key'] != null && ctx['key'] !== '') {
    return ctx['key'];
  }

  return (
    ctx['Ref_Key'] ??
    ctx['Ref'] ??
    ctx['id'] ??
    ctx['Code'] ??
    ''
  );
};

const asBody = (
  ctx: Record<string, unknown>,
  fallback: Record<string, unknown>,
): Record<string, unknown> => {
  if (ctx['body'] && typeof ctx['body'] === 'object' && !Array.isArray(ctx['body'])) {
    return ctx['body'] as Record<string, unknown>;
  }

  const fromCtx: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(ctx)) {
    if (RESERVED.has(key) || key.startsWith('odata')) {
      continue;
    }

    fromCtx[key] = value;
  }

  if (Object.keys(fromCtx).length > 0) {
    return fromCtx;
  }

  return fallback;
};

const parseResponse = async (response: Response) => {
  const text = await response.text();
  const parsed = parseODataJson(text);

  return { text, parsed };
};

const request = async (
  url: string,
  credentials: Record<string, string>,
  init?: RequestInit,
) => {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...authHeaders(credentials),
      ...(init?.headers || {}),
    },
    signal: init?.signal ?? AbortSignal.timeout(30_000),
  });
  const { text, parsed } = await parseResponse(response);

  if (!response.ok) {
    return {
      ok: false as const,
      error: odataError(response.status, parsed, text),
    };
  }

  return { ok: true as const, parsed, status: response.status, url };
};

const listPayload = (url: string, parsed: unknown) => {
  const records = recordsFromOData(parsed).map((item) =>
    item && typeof item === 'object'
      ? stripODataMeta(item as Record<string, unknown>)
      : item,
  );

  return {
    url,
    count: records.length,
    records,
    items: records,
    rows: records,
  };
};

const recordPayload = (
  url: string,
  status: number,
  parsed: unknown,
  extra: Record<string, unknown> = {},
) => {
  const record =
    parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? stripODataMeta(parsed as Record<string, unknown>)
      : parsed;

  return {
    url,
    status,
    record,
    ...(record && typeof record === 'object' ? (record as Record<string, unknown>) : {}),
    ...extra,
  };
};

export const oneCConnector: Connector = {
  id: 'onec',
  name: '1С',
  description:
    'HTTP/OData 1С:CRM: поиск, чтение, создание и обновление записей. Имя ресурса — из публикации OData',
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
      label: 'Ресурс по умолчанию',
      placeholder: 'Catalog_Контрагенты',
    },
  ],
  actions: [
    {
      id: 'query',
      name: 'Найти записи',
      description:
        'GET коллекции OData: $filter / field+op+value, $select, $top. Результат — records',
      paramsSchema: {
        resource: { type: 'string', description: 'Переопределить ресурс' },
        filter: {
          type: 'string',
          description: "OData $filter, например ИНН eq '{{previous.inn}}'",
        },
        field: { type: 'string', description: 'Поле фильтра, если нет filter' },
        op: {
          type: 'string',
          description: 'eq | ne | gt | ge | lt | le | contains | empty',
        },
        value: { type: 'string', description: 'Значение или $today' },
        select: { type: 'string', description: 'Поля через запятую' },
        top: { type: 'number', description: 'Максимум записей, по умолчанию 100' },
        skip: { type: 'number', description: '$skip' },
        orderby: { type: 'string', description: '$orderby' },
        expand: { type: 'string', description: '$expand, связи/табличные части' },
      },
    },
    {
      id: 'get',
      name: 'Прочитать запись',
      description: 'GET одной записи по ключу (Ref_Key / guid)',
      paramsSchema: {
        resource: { type: 'string', description: 'Переопределить ресурс' },
        key: {
          type: 'string',
          required: true,
          description: "Ключ. Можно {{item.Ref_Key}} или guid",
        },
        keyField: {
          type: 'string',
          description: 'Имя ключевого поля, если не Ref_Key',
        },
        select: { type: 'string', description: 'Поля через запятую' },
      },
    },
    {
      id: 'create_record',
      name: 'Создать запись',
      description: 'POST JSON в ресурс 1С (лид, задача, контрагент)',
      paramsSchema: {
        resource: { type: 'string', description: 'Переопределить ресурс' },
        body: {
          type: 'object',
          description: 'Тело запроса; иначе поля предыдущего шага',
        },
      },
    },
    {
      id: 'update',
      name: 'Обновить запись',
      description: 'PATCH по ключу. Тело — body или поля предыдущего шага',
      paramsSchema: {
        resource: { type: 'string', description: 'Переопределить ресурс' },
        key: {
          type: 'string',
          required: true,
          description: 'Ключ записи, {{item.Ref_Key}}',
        },
        keyField: {
          type: 'string',
          description: 'Имя ключевого поля, если не Ref_Key',
        },
        body: {
          type: 'object',
          description: 'Поля для PATCH',
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
        headers: authHeaders(credentials),
        signal: AbortSignal.timeout(15_000),
      });

      if (!response.ok) {
        const fallback = await fetch(baseUrl, {
          headers: authHeaders(credentials),
          signal: AbortSignal.timeout(15_000),
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
    const params = interpolate(
      input.params,
      input.context ?? input.previousResult,
    ) as Record<string, unknown>;
    const ctx = mergeContext(params, input.previousResult, input.context);
    const baseUrl = input.credentials['baseUrl'];
    const resource = resolveResource(ctx, input.credentials);

    if (!baseUrl) {
      return { ok: false, error: 'Не задан baseUrl 1С' };
    }

    if (!resource) {
      return { ok: false, error: 'Не задан resource 1С (имя сущности OData)' };
    }

    try {
      if (input.action === 'query') {
        const top = Math.min(
          Math.max(Number(params['top'] ?? ctx['top'] ?? 100) || 100, 1),
          1000,
        );
        const skip = Number(params['skip'] || 0);
        const url =
          joinUrl(baseUrl, resource) +
          queryString({
            $format: 'json',
            $filter: buildFilter(params),
            $select: firstNonEmpty(params['select']),
            $top: top,
            $skip: Number.isFinite(skip) && skip > 0 ? skip : undefined,
            $orderby: firstNonEmpty(params['orderby']),
            $expand: firstNonEmpty(params['expand']),
          });
        const result = await request(url, input.credentials);

        if (!result.ok) {
          return { ok: false, error: result.error };
        }

        return { ok: true, data: listPayload(result.url, result.parsed) };
      }

      if (input.action === 'get') {
        const key = resolveKey({ ...ctx, ...params });

        if (key == null || key === '') {
          return { ok: false, error: 'Укажите key записи (Ref_Key / guid)' };
        }

        const path = resourceWithKey(
          resource,
          key,
          firstNonEmpty(params['keyField']),
        );
        const url =
          joinUrl(baseUrl, path) +
          queryString({
            $format: 'json',
            $select: firstNonEmpty(params['select']),
          });
        const result = await request(url, input.credentials);

        if (!result.ok) {
          return { ok: false, error: result.error };
        }

        return {
          ok: true,
          data: recordPayload(result.url, result.status, result.parsed),
        };
      }

      if (input.action === 'create_record') {
        const body = asBody(params, {
          Description: firstNonEmpty(
            ctx['name'],
            ctx['company'],
            ctx['subject'],
          ),
          Name: firstNonEmpty(ctx['name']),
          Phone: firstNonEmpty(ctx['phone']),
          Company: firstNonEmpty(ctx['company']),
          Amount: ctx['amount'] ?? null,
        });
        const url = joinUrl(baseUrl, resource);
        const result = await request(url, input.credentials, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!result.ok) {
          return { ok: false, error: result.error };
        }

        return {
          ok: true,
          data: recordPayload(result.url, result.status, result.parsed, {
            posted: body,
          }),
        };
      }

      if (input.action === 'update') {
        const key = resolveKey({ ...ctx, ...params });

        if (key == null || key === '') {
          return { ok: false, error: 'Укажите key записи для PATCH' };
        }

        const body = asBody(params, {});
        const patch: Record<string, unknown> = {};

        for (const [name, value] of Object.entries(body)) {
          if (
            RESERVED.has(name) ||
            name.startsWith('odata') ||
            name === 'Ref_Key' ||
            name === 'Ref'
          ) {
            continue;
          }

          patch[name] = value;
        }

        if (Object.keys(patch).length === 0) {
          return { ok: false, error: 'Нет полей для обновления (body)' };
        }

        const path = resourceWithKey(
          resource,
          key,
          firstNonEmpty(params['keyField']),
        );
        const url = joinUrl(baseUrl, path);
        const result = await request(url, input.credentials, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'If-Match': '*',
          },
          body: JSON.stringify(patch),
        });

        if (!result.ok) {
          return { ok: false, error: result.error };
        }

        return {
          ok: true,
          data: recordPayload(result.url, result.status, result.parsed, {
            patched: patch,
          }),
        };
      }

      return { ok: false, error: `Неизвестное действие: ${input.action}` };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : '1C connector error',
      };
    }
  },
};
