import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../db/prisma.service';
import { RedisService } from '../redis/redis.service';
import { NodeEnv } from '../config/env.validation';
import { ProblemException } from '../http/errors/problem.exception';
import { ErrorCode } from '../http/errors/error-codes';

@Injectable()
export class ReadinessService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async assertReady(): Promise<void> {
    const nodeEnv = this.config.get<string>('NODE_ENV') ?? NodeEnv.Development;
    const productionLike = nodeEnv === NodeEnv.Production || nodeEnv === NodeEnv.Staging;

    const failures: Array<{ field: string; message: string }> = [];

    const shouldCheckDb = productionLike || this.prisma.isEnabled();
    if (shouldCheckDb) {
      try {
        await this.prisma.ping();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        failures.push({ field: 'db', message: `Postgres not ready: ${message}` });
      }
    }

    const shouldCheckRedis = productionLike || this.redis.isEnabled();
    if (shouldCheckRedis) {
      try {
        await this.redis.ping();
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        failures.push({ field: 'redis', message: `Redis not ready: ${message}` });
      }
    }

    if (failures.length > 0) {
      throw new ProblemException(503, {
        title: 'Service Unavailable',
        detail: 'Readiness checks failed',
        code: ErrorCode.INTERNAL,
        errors: failures,
      });
    }
  }
}
