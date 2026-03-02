import { createHash } from 'crypto';
import type { RedisService } from '../../../../platform/redis/redis.service';
export { asNonEmptyString } from '../../../../shared/string';

export { asPositiveInt } from '../../../../platform/config/env-parsing';

export function hashKey(value: string): string {
  return createHash('sha256').update(value).digest('base64url');
}

export async function getRetryAfterSeconds(
  client: ReturnType<RedisService['getClient']>,
  key: string,
  fallbackSeconds: number,
): Promise<number> {
  const ttl = await client.ttl(key);
  return ttl > 0 ? ttl : fallbackSeconds;
}
