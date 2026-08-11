import { createHash } from 'crypto';
import type { RedisService } from '../../../../platform/redis/redis.service';
import { AuthError } from '../auth.errors';
import { ErrorCode } from '../../../../platform/http/errors/error-codes';

type RedisClient = ReturnType<RedisService['getClient']>;

export type IpRateLimitConfig = Readonly<{
  maxAttempts: number;
  windowSeconds: number;
  blockSeconds: number;
}>;

export function rateLimitError(message: string, retryAfterSeconds: number): AuthError {
  return new AuthError({
    status: 429,
    code: ErrorCode.RATE_LIMITED,
    message,
    retryAfterSeconds,
  });
}

export function hashKey(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

export async function getRetryAfterSeconds(
  client: RedisClient,
  key: string,
  fallbackSeconds: number,
): Promise<number> {
  const ttl = await client.ttl(key);
  return ttl > 0 ? ttl : fallbackSeconds;
}

export async function applyIpRateLimit(input: {
  client: RedisClient;
  ip: string;
  keyPrefix: string;
  config: IpRateLimitConfig;
}): Promise<number | undefined> {
  const { client, ip, keyPrefix, config } = input;
  const ipHash = hashKey(ip);
  const countKey = `${keyPrefix}:${ipHash}:requests`;
  const blockKey = `${keyPrefix}:${ipHash}:blocked`;

  const blocked = await client.get(blockKey);
  if (blocked) {
    return getRetryAfterSeconds(client, blockKey, config.blockSeconds);
  }

  const count = await client.incr(countKey);
  if (count === 1) {
    await client.expire(countKey, config.windowSeconds);
  }

  if (count >= config.maxAttempts) {
    await client.set(blockKey, '1', 'EX', config.blockSeconds);
  }

  return undefined;
}
