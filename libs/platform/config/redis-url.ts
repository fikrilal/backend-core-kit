export function normalizeRedisUrl(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  return trimmed !== '' ? trimmed : undefined;
}
