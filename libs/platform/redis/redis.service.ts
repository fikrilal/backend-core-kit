import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { buildRedisConnectionOptions } from '../config/redis-connection';
import { NodeEnv } from '../config/env.validation';

const DEFAULT_REDIS_CONNECT_TIMEOUT_MS = 10_000;
const DEFAULT_REDIS_COMMAND_TIMEOUT_MS = 5_000;
const DEFAULT_REDIS_MAX_RETRIES_PER_REQUEST = 2;
const DEFAULT_REDIS_RETRY_BASE_DELAY_MS = 100;
const DEFAULT_REDIS_RETRY_MAX_DELAY_MS = 2_000;
const DEFAULT_REDIS_ENABLE_OFFLINE_QUEUE = true;

function asInteger(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isInteger(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const n = Number(trimmed);
  return Number.isInteger(n) ? n : undefined;
}

function readIntConfig(
  config: ConfigService,
  name: string,
  fallback: number,
  minimum: number,
): number {
  const raw = config.get<unknown>(name);
  const parsed = asInteger(raw);
  if (parsed === undefined) return fallback;
  if (parsed < minimum) {
    throw new Error(`Invalid ${name}: expected integer >= ${minimum}, got "${String(raw)}"`);
  }
  return parsed;
}

function readBooleanConfig(config: ConfigService, name: string, fallback: boolean): boolean {
  const raw = config.get<unknown>(name);
  if (typeof raw === 'boolean') return raw;
  if (typeof raw !== 'string') return fallback;
  const normalized = raw.trim().toLowerCase();
  if (normalized === '') return fallback;
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  throw new Error(`Invalid ${name}: expected boolean, got "${String(raw)}"`);
}

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
      const connectTimeout = readIntConfig(
        this.config,
        'REDIS_CONNECT_TIMEOUT_MS',
        DEFAULT_REDIS_CONNECT_TIMEOUT_MS,
        1,
      );
      const commandTimeout = readIntConfig(
        this.config,
        'REDIS_COMMAND_TIMEOUT_MS',
        DEFAULT_REDIS_COMMAND_TIMEOUT_MS,
        1,
      );
      const maxRetriesPerRequest = readIntConfig(
        this.config,
        'REDIS_MAX_RETRIES_PER_REQUEST',
        DEFAULT_REDIS_MAX_RETRIES_PER_REQUEST,
        0,
      );
      const retryBaseDelayMs = readIntConfig(
        this.config,
        'REDIS_RETRY_BASE_DELAY_MS',
        DEFAULT_REDIS_RETRY_BASE_DELAY_MS,
        1,
      );
      const retryMaxDelayMs = readIntConfig(
        this.config,
        'REDIS_RETRY_MAX_DELAY_MS',
        DEFAULT_REDIS_RETRY_MAX_DELAY_MS,
        retryBaseDelayMs,
      );
      const enableOfflineQueue = readBooleanConfig(
        this.config,
        'REDIS_ENABLE_OFFLINE_QUEUE',
        DEFAULT_REDIS_ENABLE_OFFLINE_QUEUE,
      );

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
