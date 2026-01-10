import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { NodeEnv } from '../config/env.validation';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly client?: Redis;
  private readonly enabled: boolean;
  private readonly connectOnStartup: boolean;

  constructor(private readonly config: ConfigService) {
    const redisUrl = this.config.get<string>('REDIS_URL');
    const nodeEnv = this.config.get<string>('NODE_ENV') ?? NodeEnv.Development;

    this.enabled = typeof redisUrl === 'string' && redisUrl.trim() !== '';
    this.connectOnStartup = nodeEnv === NodeEnv.Production || nodeEnv === NodeEnv.Staging;

    if (typeof redisUrl === 'string' && redisUrl.trim() !== '') {
      this.client = new Redis(redisUrl, { lazyConnect: true });
    }
  }

  isEnabled(): boolean {
    return this.enabled;
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
    await this.client?.quit();
  }

  async ping(): Promise<void> {
    const client = this.getClient();
    await client.ping();
  }
}
