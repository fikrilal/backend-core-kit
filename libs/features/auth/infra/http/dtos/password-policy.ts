const DEFAULT_AUTH_PASSWORD_MIN_LENGTH = 10;

function parsePositiveInt(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return undefined;
  return n;
}

export const AUTH_PASSWORD_MIN_LENGTH: number = (() => {
  const configured = parsePositiveInt(process.env.AUTH_PASSWORD_MIN_LENGTH);
  return configured ?? DEFAULT_AUTH_PASSWORD_MIN_LENGTH;
})();
