import { Module } from '@nestjs/common';
import { PrismaModule } from '../db/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { HealthController } from './health.controller';
import { ReadyController } from './ready.controller';
import { ReadinessService } from './readiness.service';

@Module({
  imports: [PrismaModule, RedisModule],
  controllers: [HealthController, ReadyController],
  providers: [ReadinessService],
})
export class HealthModule {}
