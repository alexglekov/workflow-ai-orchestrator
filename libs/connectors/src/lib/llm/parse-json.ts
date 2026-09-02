export const stripFences = (text: string): string =>
  text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/u, '').trim();

export const parseJsonObject = (text: string): Record<string, unknown> => {
  const raw = stripFences(text);

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }

    return { value: parsed };
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');

    if (start >= 0 && end > start) {
      const nested = JSON.parse(raw.slice(start, end + 1)) as unknown;

      if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
        return nested as Record<string, unknown>;
      }
    }

    throw new Error('Модель вернула не JSON-объект');
  }
};
