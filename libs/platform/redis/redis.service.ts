import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CONFIG_DEFAULTS } from '../config/env.defaults';
import { buildRedisConnectionOptions } from '../config/redis-connection';
import { NodeEnv } from '../config/env.validation';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly client?: Redis;
  private readonly connectOnStartup: boolean;

  constructor(private readonly config: ConfigService) {
    const nodeEnv = this.config.get<string>('NODE_ENV') ?? NodeEnv.Development;

    this.connectOnStartup = nodeEnv === NodeEnv.Production || nodeEnv === NodeEnv.Staging;

    const redis = buildRedisConnectionOptions({
      redisUrl: this.config.get<string>('REDIS_URL'),
      tlsRejectUnauthorized: this.config.get<boolean>('REDIS_TLS_REJECT_UNAUTHORIZED') ?? true,
    });

    if (redis) {
      const connectTimeout =
        this.config.get<number>('REDIS_CONNECT_TIMEOUT_MS') ??
        REDIS_CONFIG_DEFAULTS.REDIS_CONNECT_TIMEOUT_MS;
      const commandTimeout =
        this.config.get<number>('REDIS_COMMAND_TIMEOUT_MS') ??
        REDIS_CONFIG_DEFAULTS.REDIS_COMMAND_TIMEOUT_MS;
      const maxRetriesPerRequest =
        this.config.get<number>('REDIS_MAX_RETRIES_PER_REQUEST') ??
        REDIS_CONFIG_DEFAULTS.REDIS_MAX_RETRIES_PER_REQUEST;
      const retryBaseDelayMs =
        this.config.get<number>('REDIS_RETRY_BASE_DELAY_MS') ??
        REDIS_CONFIG_DEFAULTS.REDIS_RETRY_BASE_DELAY_MS;
      const retryMaxDelayMs =
        this.config.get<number>('REDIS_RETRY_MAX_DELAY_MS') ??
        REDIS_CONFIG_DEFAULTS.REDIS_RETRY_MAX_DELAY_MS;
      const enableOfflineQueue =
        this.config.get<boolean>('REDIS_ENABLE_OFFLINE_QUEUE') ??
        REDIS_CONFIG_DEFAULTS.REDIS_ENABLE_OFFLINE_QUEUE;

      const { url, ...options } = redis;
      this.client = new Redis(url, {
        lazyConnect: true,
        connectTimeout,
        commandTimeout,
        maxRetriesPerRequest,
        enableOfflineQueue,
        retryStrategy: (times) => Math.min(retryMaxDelayMs, times * retryBaseDelayMs),
        ...options,
      });
    }
  }

  isEnabled(): boolean {
    return this.client !== undefined;
  }

  getClient(): Redis {
    if (!this.client) {
      throw new Error('REDIS_URL is not configured');
    }
    return this.client;
  }

  async onModuleInit(): Promise<void> {
    if (!this.client || !this.connectOnStartup) return;
    await this.client.connect();
    await this.ping();
  }

  async onModuleDestroy(): Promise<void> {
    const client = this.client;
    if (!client) return;

    const status = client.status;
    const shouldGracefullyQuit = status === 'ready' || status === 'connect';

    if (shouldGracefullyQuit) {
      try {
        await client.quit();
        return;
      } catch {
        client.disconnect();
        return;
      }
    }

    client.disconnect();
  }

  async ping(): Promise<void> {
    const client = this.getClient();
    await client.ping();
  }
}
