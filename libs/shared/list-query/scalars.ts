import type { CursorFieldType, FilterFieldType, Scalar } from './types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return undefined;

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return undefined;
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;

  const normalized = value.trim();
  if (normalized === '') return undefined;

  const n = Number(normalized);
  return Number.isFinite(n) ? n : undefined;
}

function parseDateIso(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  if (normalized === '') return undefined;

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function parseUuid(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  if (normalized === '') return undefined;
  return UUID_RE.test(normalized) ? normalized : undefined;
}

function parseString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized === '' ? undefined : normalized;
}

export function parseScalar(type: CursorFieldType, value: unknown): Scalar | undefined {
  switch (type) {
    case 'string':
      return parseString(value);
    case 'uuid':
      return parseUuid(value);
    case 'datetime':
      return parseDateIso(value);
    case 'number':
      return parseNumber(value);
    case 'boolean':
      return parseBoolean(value);
  }
}

export function parseFilterScalar(
  type: FilterFieldType,
  value: unknown,
  enumValues?: ReadonlyArray<string>,
): Scalar | undefined {
  if (type === 'enum') {
    const s = parseString(value);
    if (!s) return undefined;
    if (!enumValues || enumValues.length === 0) return undefined;
    return enumValues.includes(s) ? s : undefined;
  }

  return parseScalar(type, value);
}
