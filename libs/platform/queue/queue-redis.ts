import type { ConfigService } from '@nestjs/config';
import {
  buildRedisConnectionOptions,
  type RedisConnectionOptions,
} from '../config/redis-connection';

export function buildQueueRedisConnection(
  config: ConfigService,
): RedisConnectionOptions | undefined {
  return buildRedisConnectionOptions({
    redisUrl: config.get<string>('REDIS_URL'),
    tlsRejectUnauthorized: config.get<boolean>('REDIS_TLS_REJECT_UNAUTHORIZED') ?? true,
  });
}
