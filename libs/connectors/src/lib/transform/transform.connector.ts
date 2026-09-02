import {
  Connector,
  ConnectorExecuteInput,
  ConnectorExecuteResult,
} from '../types';
import {
  asRecord,
  getPath,
  interpolate,
  isTemplateContext,
  templateContext,
  unwrapItems,
} from '../interpolate';

const asList = (value: unknown): unknown[] => unwrapItems(value) ?? [];

const asFields = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/[,;\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const resolveValue = (value: unknown): unknown => {
  if (value === '$today') {
    return todayIso();
  }

  if (value === '$now') {
    return new Date().toISOString();
  }

  return value;
};

const asNumber = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value
      .replace(/\s/g, '')
      .replace(',', '.')
      .replace(/[^\d.-]/g, '');
    const parsed = Number(normalized);

    return Number.isFinite(parsed) && normalized ? parsed : null;
  }

  return null;
};

const fieldValue = (item: unknown, field: string): unknown => {
  if (!field) {
    return item;
  }

  if (item && typeof item === 'object') {
    const record = item as Record<string, unknown>;

    if (field in record) {
      return record[field];
    }
  }

  return getPath(item, field);
};

const compare = (left: unknown, op: string, rawRight: unknown): boolean => {
  const right = resolveValue(rawRight);

  if (op === 'empty') {
    return left == null || String(left).trim() === '';
  }

  if (op === 'not_empty') {
    return !(left == null || String(left).trim() === '');
  }

  if (op === 'contains') {
    return String(left ?? '')
      .toLowerCase()
      .includes(String(right ?? '').toLowerCase());
  }

  const leftNumber = asNumber(left);
  const rightNumber = asNumber(right);

  if (
    leftNumber != null &&
    rightNumber != null &&
    ['gt', 'gte', 'lt', 'lte', 'eq', 'neq'].includes(op)
  ) {
    if (op === 'gt') return leftNumber > rightNumber;
    if (op === 'gte') return leftNumber >= rightNumber;
    if (op === 'lt') return leftNumber < rightNumber;
    if (op === 'lte') return leftNumber <= rightNumber;
    if (op === 'eq') return leftNumber === rightNumber;
    return leftNumber !== rightNumber;
  }

  const leftText = String(left ?? '');
  const rightText = String(right ?? '');

  if (op === 'gt') return leftText > rightText;
  if (op === 'gte') return leftText >= rightText;
  if (op === 'lt') return leftText < rightText;
  if (op === 'lte') return leftText <= rightText;
  if (op === 'eq') return leftText === rightText;
  if (op === 'neq') return leftText !== rightText;

  return false;
};

type FilterClause = { field: string; op: string; value?: unknown };

const asFilters = (params: Record<string, unknown>): FilterClause[] => {
  const extra = Array.isArray(params['filters'])
    ? (params['filters'] as unknown[])
    : [];
  const fromExtra = extra.flatMap((item) => {
    const record = asRecord(item);
    const field = String(record['field'] || '').trim();

    if (!field && !record['op']) {
      return [];
    }

    return [
      {
        field,
        op: String(record['op'] || 'eq'),
        value: record['value'],
      },
    ];
  });
  const field = String(params['field'] || '').trim();

  if (field || params['op']) {
    return [
      { field, op: String(params['op'] || 'eq'), value: params['value'] },
      ...fromExtra,
    ];
  }

  return fromExtra;
};

const pickFields = (
  item: unknown,
  fields: string[],
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};

  for (const field of fields) {
    out[field] = fieldValue(item, field);
  }

  return out;
};

const listPayload = (items: unknown[]) => ({
  count: items.length,
  items,
  rows: items,
});

const sortItems = (
  items: unknown[],
  field: string,
  direction: string,
): unknown[] => {
  const sign = direction === 'desc' ? -1 : 1;
  const copy = [...items];

  copy.sort((left, right) => {
    const leftValue = fieldValue(left, field);
    const rightValue = fieldValue(right, field);
    const leftNumber = asNumber(leftValue);
    const rightNumber = asNumber(rightValue);

    if (leftNumber != null && rightNumber != null) {
      return (leftNumber - rightNumber) * sign;
    }

    return (
      String(leftValue ?? '').localeCompare(String(rightValue ?? ''), 'ru') * sign
    );
  });

  return copy;
};

export const transformConnector: Connector = {
  id: 'transform',
  name: 'Transform',
  description:
    'Фильтр, сортировка, выбор полей и сборка текста без LLM. Подключение не нужно',
  credentialFields: [],
  actions: [
    {
      id: 'filter',
      name: 'Отфильтровать',
      description:
        'Оставляет элементы списка по полю: gt, gte, lt, lte, eq, contains. value=$today — сегодня',
      paramsSchema: {
        field: { type: 'string', required: true, description: 'Имя поля' },
        op: {
          type: 'string',
          description: 'gt | gte | lt | lte | eq | neq | contains | empty | not_empty',
        },
        value: { type: 'string', description: 'Значение или $today' },
        filters: {
          type: 'object',
          description: 'Доп. условия [{field, op, value}]',
        },
      },
    },
    {
      id: 'sort',
      name: 'Отсортировать',
      description: 'Сортирует список по полю',
      paramsSchema: {
        field: { type: 'string', required: true, description: 'Имя поля' },
        direction: { type: 'string', description: 'asc или desc' },
        limit: { type: 'number', description: 'Оставить первые N' },
      },
    },
    {
      id: 'pick',
      name: 'Выбрать поля',
      description: 'Оставляет только указанные поля у объекта или у каждого элемента',
      paramsSchema: {
        fields: {
          type: 'string',
          required: true,
          description: 'Поля через запятую',
        },
      },
    },
    {
      id: 'join',
      name: 'Склеить список',
      description:
        'Собирает текст из элементов. В itemTemplate используйте {{item.поле}} — подставится на каждом элементе',
      paramsSchema: {
        itemTemplate: {
          type: 'string',
          required: true,
          description: 'Шаблон элемента, {{item.поле}}',
        },
        separator: { type: 'string', description: 'Разделитель, по умолчанию перевод строки' },
        empty: { type: 'string', description: 'Текст, если список пуст' },
      },
    },
    {
      id: 'template',
      name: 'Собрать текст',
      description: 'Подставляет {{previous.поле}} и {{item.поле}} в шаблон',
      paramsSchema: {
        text: {
          type: 'string',
          required: true,
          description: 'Шаблон. Можно {{previous.btcRub}}',
        },
      },
    },
  ],
  testConnection: async () => ({
    ok: true,
    message: 'Transform не требует подключения',
  }),
  execute: async (
    input: ConnectorExecuteInput,
  ): Promise<ConnectorExecuteResult> => {
    const context = input.context ?? input.previousResult;
    const params = interpolate(input.params, context) as Record<string, unknown>;

    try {
      if (input.action === 'filter') {
        const filters = asFilters(params);

        if (filters.length === 0) {
          return { ok: false, error: 'Укажите field и op' };
        }

        const items = asList(input.previousResult).filter((item) =>
          filters.every((clause) =>
            compare(fieldValue(item, clause.field), clause.op, clause.value),
          ),
        );

        return { ok: true, data: listPayload(items) };
      }

      if (input.action === 'sort') {
        const field = String(params['field'] || '').trim();

        if (!field) {
          return { ok: false, error: 'Укажите field' };
        }

        const sorted = sortItems(
          asList(input.previousResult),
          field,
          String(params['direction'] || 'asc'),
        );
        const limit = Number(params['limit'] || 0);
        const items =
          Number.isFinite(limit) && limit > 0 ? sorted.slice(0, limit) : sorted;

        return { ok: true, data: listPayload(items) };
      }

      if (input.action === 'pick') {
        const fields = asFields(params['fields']);

        if (fields.length === 0) {
          return { ok: false, error: 'Укажите fields' };
        }

        const items = unwrapItems(input.previousResult);

        if (items) {
          return { ok: true, data: listPayload(items.map((item) => pickFields(item, fields))) };
        }

        return { ok: true, data: pickFields(input.previousResult, fields) };
      }

      if (input.action === 'join') {
        const itemTemplate = String(input.params['itemTemplate'] || '');

        if (!itemTemplate.trim()) {
          return { ok: false, error: 'Укажите itemTemplate' };
        }

        const items = asList(input.previousResult);
        const separator =
          typeof params['separator'] === 'string' ? params['separator'] : '\n';
        const empty = String(params['empty'] || '');

        if (items.length === 0) {
          return { ok: true, data: { text: empty, count: 0 } };
        }

        const base = isTemplateContext(input.context)
          ? input.context
          : templateContext({ previous: input.previousResult });
        const lines = items.map((item) =>
          String(
            interpolate(
              itemTemplate,
              templateContext({
                input: base.input,
                previous: base.previous,
                item,
                steps: base.steps,
              }),
            ),
          ),
        );

        return {
          ok: true,
          data: { text: lines.join(separator), count: items.length },
        };
      }

      if (input.action === 'template') {
        const text = String(params['text'] ?? '');

        if (!text.trim()) {
          return { ok: false, error: 'Укажите text' };
        }

        return { ok: true, data: { text } };
      }

      return { ok: false, error: `Неизвестное действие: ${input.action}` };
    } catch (error) {
      return {
        ok: false,
        error:
          error instanceof Error ? error.message : 'Transform connector error',
      };
    }
  },
};
