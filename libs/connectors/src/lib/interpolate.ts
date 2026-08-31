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

export const interpolate = (value: unknown, previous: unknown): unknown => {
  if (typeof value === 'string') {
    return value.replace(
      /\{\{\s*previous(?:\.([^}]+))?\s*\}\}/g,
      (_match, path?: string) => {
        if (!path) {
          return stringifyResult(previous);
        }

        const resolved = getPath(previous, path.trim());

        if (resolved == null) {
          return '';
        }

        return typeof resolved === 'string'
          ? resolved
          : stringifyResult(resolved);
      },
    );
  }

  if (Array.isArray(value)) {
    return value.map((item) => interpolate(item, previous));
  }

  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};

    for (const [key, nested] of Object.entries(
      value as Record<string, unknown>,
    )) {
      out[key] = interpolate(nested, previous);
    }

    return out;
  }

  return value;
};

export const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return {};
};

export const mergeContext = (
  params: Record<string, unknown>,
  previous: unknown,
): Record<string, unknown> => {
  const interpolated = interpolate(params, previous) as Record<string, unknown>;
  const prev = asRecord(previous);

  return { ...prev, ...interpolated };
};

export const firstNonEmpty = (...values: unknown[]): string => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
};
