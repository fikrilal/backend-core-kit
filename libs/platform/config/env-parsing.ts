export function parseEnvBoolean(value: unknown): boolean | undefined | string {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;

  const normalized = String(value).trim().toLowerCase();
  if (normalized === '') return undefined;
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;

  // Return the original value so callers can decide whether to fail fast or ignore invalid input.
  return String(value);
}

export function parseOptionalEnvBoolean(value: unknown): boolean | undefined {
  const parsed = parseEnvBoolean(value);
  return typeof parsed === 'boolean' ? parsed : undefined;
}

export function parseOptionalBooleanOrThrow(name: string, value: unknown): boolean | undefined {
  const parsed = parseEnvBoolean(value);
  if (parsed === undefined || typeof parsed === 'boolean') return parsed;
  throw new Error(`Invalid ${name}: expected boolean, got "${String(value)}"`);
}

export function parsePositiveIntOrThrow(name: string, value: unknown, fallback: number): number {
  if (value === undefined) return fallback;
  const normalized = String(value).trim();
  if (normalized === '') return fallback;

  const n = Number(normalized);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new Error(`Invalid ${name}: expected positive integer, got "${String(value)}"`);
  }
  return n;
}

export function asEnvNumber(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === '') return fallback;
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export function asPositiveInt(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return fallback;
  return n;
}
