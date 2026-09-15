export type TemplateContext = {
  __kind: 'tpl';
  input: Record<string, unknown>;
  previous: unknown;
  item?: unknown;
  steps: Record<string, unknown>;
};

export const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
};

export const templateContext = (partial: {
  input?: unknown;
  previous?: unknown;
  item?: unknown;
  steps?: Record<string, unknown>;
}): TemplateContext => ({
  __kind: 'tpl',
  input: asRecord(partial.input),
  previous: partial.previous ?? null,
  item: partial.item,
  steps: partial.steps ?? {},
});

export const isTemplateContext = (value: unknown): value is TemplateContext =>
  Boolean(
    value &&
      typeof value === 'object' &&
      (value as TemplateContext).__kind === 'tpl',
  );

export const toTemplateContext = (value: unknown): TemplateContext =>
  isTemplateContext(value) ? value : templateContext({ previous: value });

export const getPath = (source: unknown, path: string): unknown => {
  if (source == null) {
    return undefined;
  }

  const parts = path.split('.').filter(Boolean);
  let current: unknown = source;

  for (const part of parts) {
    if (current == null || typeof current !== 'object') {
      return undefined;
    }

    current = (current as Record<string, unknown>)[part];
  }

  return current;
};

export const stringifyResult = (value: unknown): string => {
  if (value == null) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

export const humanText = (value: unknown, depth = 0): string => {
  if (value == null) {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (depth > 4) {
    return '';
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => humanText(item, depth + 1))
      .filter(Boolean)
      .join('\n');
  }

  const record = asRecord(value);

  if (record['skipped'] === true) {
    return '';
  }

  const items = record['items'] ?? record['messages'];
  const listed = Array.isArray(items);

  if (listed) {
    const lines = items
      .map((item) => humanText(item, depth + 1))
      .filter(Boolean);

    if (lines.length) {
      return lines.join('\n');
    }

    return '';
  }

  const text = firstNonEmpty(
    record['text'],
    record['answer'],
    record['subject'],
    record['body'],
    record['caption'],
  );
  const who = firstNonEmpty(record['username'], record['from'], record['name']);

  if (text && who && who !== text) {
    return `${who}: ${text}`;
  }

  if (text) {
    return text;
  }

  if (record['isVoice'] === true || record['is_voice'] === true) {
    return who ? `${who}: голосовое сообщение` : 'Голосовое сообщение';
  }

  if (record['sent'] === true) {
    return firstNonEmpty(record['text']) || '';
  }

  if (record['source'] === 'event' || record['count'] === 0) {
    return '';
  }

  return stringifyResult(value);
};

const resolveRoot = (ctx: TemplateContext, name: string): unknown => {
  if (name === 'input') {
    return ctx.input;
  }

  if (name === 'previous') {
    return ctx.previous;
  }

  if (name === 'item') {
    return ctx.item ?? ctx.previous;
  }

  if (name === 'steps') {
    return ctx.steps;
  }

  return undefined;
};

const lookup = (ctx: TemplateContext, name: string, path?: string): unknown => {
  const root = resolveRoot(ctx, name);

  if (root === undefined) {
    return undefined;
  }

  if (!path) {
    return root;
  }

  return getPath(root, path.trim());
};

export const interpolate = (value: unknown, context: unknown): unknown => {
  const ctx = toTemplateContext(context);

  if (typeof value === 'string') {
    return value.replace(
      /\{\{\s*([a-zA-Z_][\w]*)(?:\.([^}]+))?\s*\}\}/g,
      (_match, name: string, path?: string) => {
        const resolved = lookup(ctx, name, path);

        if (resolved == null) {
          return '';
        }

        return typeof resolved === 'string'
          ? resolved
          : humanText(resolved);
      },
    );
  }

  if (Array.isArray(value)) {
    return value.map((item) => interpolate(item, ctx));
  }

  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};

    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>,
    )) {
      out[key] = interpolate(nested, ctx);
    }

    return out;
  }

  return value;
};

export const flattenStepOutputs = (
  steps?: Record<string, unknown>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};

  if (!steps) {
    return out;
  }

  for (const value of Object.values(steps)) {
    Object.assign(out, asRecord(value));
  }

  return out;
};

export const mergeContext = (
  params: Record<string, unknown>,
  previous: unknown,
  context?: TemplateContext,
): Record<string, unknown> => {
  const ctx = context ?? templateContext({ previous });
  const interpolated = interpolate(params, ctx) as Record<string, unknown>;

  return {
    ...flattenStepOutputs(ctx.steps),
    ...asRecord(ctx.previous),
    ...asRecord(ctx.item),
    ...asRecord(previous),
    ...interpolated,
  };
};

export const firstNonEmpty = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
};

export const unwrapItems = (value: unknown): unknown[] | null => {
  if (Array.isArray(value)) {
    return value;
  }

  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;

  for (const key of ['messages', 'rows', 'items', 'records', 'results']) {
    if (Array.isArray(record[key])) {
      return record[key] as unknown[];
    }
  }

  return null;
};
