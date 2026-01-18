import { createHash } from 'crypto';
import type { RedisService } from '../../../../platform/redis/redis.service';

export function hashKey(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

export function asPositiveInt(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return fallback;
  return n;
}

export function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed !== '' ? trimmed : undefined;
}

export async function getRetryAfterSeconds(
  client: ReturnType<RedisService['getClient']>,
  key: string,
  fallbackSeconds: number,
): Promise<number> {
  const ttl = await client.ttl(key);
  return ttl > 0 ? ttl : fallbackSeconds;
}
