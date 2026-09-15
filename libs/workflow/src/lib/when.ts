import { interpolate, type TemplateContext } from '@ai-worker/connectors';

const isTruthy = (value: string): boolean => {
  const text = value.trim().toLowerCase();

  if (!text || text === 'false' || text === '0' || text === 'null' || text === 'undefined') {
    return false;
  }

  return true;
};

const asNumber = (value: string): number | null => {
  const parsed = Number(value.replace(',', '.'));

  return Number.isFinite(parsed) && value.trim() !== '' ? parsed : null;
};

const compare = (left: string, op: string, right: string): boolean => {
  const leftN = asNumber(left);
  const rightN = asNumber(right);
  const numeric = leftN != null && rightN != null;

  if (numeric && (op === '>' || op === '<' || op === '>=' || op === '<=')) {
    if (op === '>') {
      return leftN > rightN;
    }

    if (op === '<') {
      return leftN < rightN;
    }

    if (op === '>=') {
      return leftN >= rightN;
    }

    return leftN <= rightN;
  }

  if (op === '!=' || op === '!==') {
    return left !== right;
  }

  return left === right;
};

export const matchWhen = (
  raw: unknown,
  context: TemplateContext,
): boolean => {
  if (raw == null || raw === '' || raw === true || raw === 'true') {
    return true;
  }

  if (raw === false || raw === 'false') {
    return false;
  }

  const rendered = String(interpolate(String(raw), context)).trim();

  if (!rendered) {
    return false;
  }

  const matched = rendered.match(
    /^(.*?)\s*(===|!==|==|!=|>=|<=|=|>|<)\s*(.*)$/,
  );

  if (!matched) {
    return isTruthy(rendered);
  }

  return compare(matched[1].trim(), matched[2], matched[3].trim());
};
