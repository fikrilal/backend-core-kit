import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient, type Prisma } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { NodeEnv } from '../config/env.validation';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly client?: PrismaClient;
  private readonly enabled: boolean;
  private readonly connectOnStartup: boolean;

  constructor(private readonly config: ConfigService) {
    const databaseUrl = this.config.get<string>('DATABASE_URL');
    const nodeEnv = this.config.get<string>('NODE_ENV') ?? NodeEnv.Development;

    this.enabled = typeof databaseUrl === 'string' && databaseUrl.trim() !== '';
    this.connectOnStartup = nodeEnv === NodeEnv.Production || nodeEnv === NodeEnv.Staging;

    if (typeof databaseUrl === 'string' && databaseUrl.trim() !== '') {
      const adapter = new PrismaPg({ connectionString: databaseUrl });
      this.client = new PrismaClient({ adapter });
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getClient(): PrismaClient {
    if (!this.client) {
      throw new Error('DATABASE_URL is not configured');
    }
    return this.client;
  }

  async onModuleInit(): Promise<void> {
    if (!this.client || !this.connectOnStartup) return;
    await this.client.$connect();
    await this.ping();
  }

  async onModuleDestroy(): Promise<void> {
    await this.client?.$disconnect();
  }

  async ping(): Promise<void> {
    const client = this.getClient();
    await client.$queryRaw`SELECT 1`;
  }

  async transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const client = this.getClient();
    return client.$transaction(async (tx) => fn(tx));
  }
}
