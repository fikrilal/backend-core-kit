import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { ReadyController } from './ready.controller';

@Module({
  controllers: [HealthController, ReadyController],
})
export class HealthModule {}

