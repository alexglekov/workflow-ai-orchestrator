const UUID =
  /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

export const joinUrl = (base: string, path: string): string => {
  const normalizedBase = base.replace(/\/+$/, '');
  const normalizedPath = path.replace(/^\/+/, '');

  if (!normalizedPath) {
    return normalizedBase;
  }

  return `${normalizedBase}/${normalizedPath}`;
};

export const basicAuthHeader = (username: string, password: string): string =>
  `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

const escapeLiteral = (value: string): string =>
  value.replace(/'/g, "''");

const asUuid = (value: string): string | null => {
  const compact = value.replace(/[{}]/g, '').trim();

  if (!UUID.test(compact)) {
    return null;
  }

  if (compact.includes('-')) {
    return compact;
  }

  return `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`;
};

export const odataLiteral = (value: unknown): string => {
  if (value === '$today') {
    return `datetime'${new Date().toISOString().slice(0, 10)}T00:00:00'`;
  }

  if (value === '$now') {
    return `datetime'${new Date().toISOString().slice(0, 19)}'`;
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (value == null) {
    return 'null';
  }

  const text = String(value).trim();

  if (!text) {
    return "''";
  }

  if (
    /^(guid|datetime|edmx)'/i.test(text) ||
    text.startsWith('(')
  ) {
    return text;
  }

  if (text === 'true' || text === 'false') {
    return text;
  }

  if (/^-?\d+(\.\d+)?$/.test(text)) {
    return text;
  }

  const uuid = asUuid(text);

  if (uuid) {
    return `guid'${uuid}'`;
  }

  return `'${escapeLiteral(text)}'`;
};

export const encodeODataKey = (
  key: unknown,
  keyField?: string,
): string => {
  if (key && typeof key === 'object' && !Array.isArray(key)) {
    const parts = Object.entries(key as Record<string, unknown>)
      .filter(([name]) => name && !name.startsWith('odata'))
      .map(([name, value]) => `${name}=${odataLiteral(value)}`);

    return parts.join(',');
  }

  const text = String(key ?? '').trim();

  if (!text) {
    return '';
  }

  const inner = text.replace(/^\(|\)$/g, '');

  if (keyField && keyField !== 'Ref_Key' && !inner.includes('=')) {
    return `${keyField}=${odataLiteral(inner)}`;
  }

  return odataLiteral(inner).replace(/^guid'guid'/, "guid'");
};

export const resourceWithKey = (
  resource: string,
  key: unknown,
  keyField?: string,
): string => {
  const encoded = encodeODataKey(key, keyField);

  if (!encoded) {
    return resource;
  }

  if (/\(.*\)$/.test(resource)) {
    return resource;
  }

  return `${resource}(${encoded})`;
};

const opMap: Record<string, string> = {
  eq: 'eq',
  ne: 'ne',
  neq: 'ne',
  gt: 'gt',
  gte: 'ge',
  ge: 'ge',
  lt: 'lt',
  lte: 'le',
  le: 'le',
};

export const odataClause = (
  field: string,
  op: string,
  value: unknown,
): string => {
  const name = field.trim();
  const operator = op.trim().toLowerCase() || 'eq';

  if (!name) {
    return '';
  }

  if (operator === 'empty') {
    return `${name} eq null`;
  }

  if (operator === 'not_empty') {
    return `${name} ne null`;
  }

  if (operator === 'contains') {
    return `substringof(${odataLiteral(value)}, ${name})`;
  }

  const mapped = opMap[operator] || 'eq';

  return `${name} ${mapped} ${odataLiteral(value)}`;
};

export const buildFilter = (params: Record<string, unknown>): string => {
  const raw = String(params['filter'] || '').trim();

  if (raw) {
    return raw;
  }

  const extra = Array.isArray(params['filters'])
    ? (params['filters'] as unknown[])
    : [];
  const clauses: string[] = [];
  const field = String(params['field'] || '').trim();

  if (field || params['op']) {
    const clause = odataClause(
      field,
      String(params['op'] || 'eq'),
      params['value'],
    );

    if (clause) {
      clauses.push(clause);
    }
  }

  for (const item of extra) {
    if (!item || typeof item !== 'object') {
      continue;
    }

    const record = item as Record<string, unknown>;
    const clause = odataClause(
      String(record['field'] || ''),
      String(record['op'] || 'eq'),
      record['value'],
    );

    if (clause) {
      clauses.push(clause);
    }
  }

  return clauses.join(' and ');
};

export const queryString = (
  params: Record<string, string | number | undefined>,
): string => {
  const parts: string[] = [];

  for (const [name, value] of Object.entries(params)) {
    if (value == null || value === '') {
      continue;
    }

    parts.push(
      `${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`,
    );
  }

  return parts.length ? `?${parts.join('&')}` : '';
};

export const parseODataJson = (text: string): unknown => {
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
};

export const recordsFromOData = (parsed: unknown): unknown[] => {
  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (!parsed || typeof parsed !== 'object') {
    return [];
  }

  const record = parsed as Record<string, unknown>;

  if (Array.isArray(record['value'])) {
    return record['value'];
  }

  if (Array.isArray(record['records'])) {
    return record['records'];
  }

  if (record['Ref_Key'] != null || record['Ref'] != null) {
    return [record];
  }

  return [];
};

export const odataError = (status: number, parsed: unknown, text: string): string => {
  if (parsed && typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>;
    const error = record['odata.error'] || record['error'];

    if (error && typeof error === 'object') {
      const body = error as Record<string, unknown>;
      const message = body['message'];

      if (typeof message === 'string' && message.trim()) {
        return `1С ${status}: ${message}`;
      }

      if (message && typeof message === 'object') {
        const value = (message as Record<string, unknown>)['value'];

        if (typeof value === 'string' && value.trim()) {
          return `1С ${status}: ${value}`;
        }
      }
    }
  }

  const xml = text.match(/<message[^>]*>([\s\S]*?)<\/message>/i)?.[1];
  const plain = (xml || text).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  return `1С ${status}: ${plain.slice(0, 800) || 'ошибка запроса'}`;
};

export const stripODataMeta = (
  value: Record<string, unknown>,
): Record<string, unknown> => {
  const out: Record<string, unknown> = {};

  for (const [key, nested] of Object.entries(value)) {
    if (key.startsWith('odata.') || key === 'odata.metadata') {
      continue;
    }

    out[key] = nested;
  }

  return out;
};
