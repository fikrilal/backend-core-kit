import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { NodeEnv } from '../config/env.validation';
import { normalizeRedisUrl } from '../config/redis-url';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly client?: Redis;
  private readonly connectOnStartup: boolean;

  constructor(private readonly config: ConfigService) {
    const redisUrl = normalizeRedisUrl(this.config.get<string>('REDIS_URL'));
    const nodeEnv = this.config.get<string>('NODE_ENV') ?? NodeEnv.Development;

    this.connectOnStartup = nodeEnv === NodeEnv.Production || nodeEnv === NodeEnv.Staging;

    if (redisUrl) {
      this.client = new Redis(redisUrl, { lazyConnect: true });
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
