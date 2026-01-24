import { normalizeRedisUrl } from './redis-url';

export type RedisConnectionOptions = Readonly<{
  url: string;
  tls?: Readonly<{ rejectUnauthorized: false }>;
}>;

function isRedissUrl(url: string): boolean {
  if (url.startsWith('rediss://')) return true;
  try {
    return new URL(url).protocol === 'rediss:';
  } catch {
    return false;
  }
}

export function buildRedisConnectionOptions(params: {
  redisUrl: unknown;
  tlsRejectUnauthorized: boolean;
}): RedisConnectionOptions | undefined {
  const url = normalizeRedisUrl(params.redisUrl);
  if (!url) return undefined;

  if (isRedissUrl(url) && params.tlsRejectUnauthorized === false) {
    return { url, tls: { rejectUnauthorized: false } };
  }

  return { url };
}

