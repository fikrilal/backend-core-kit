import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from '../../../libs/platform/config/env.validation';
import { HealthModule } from '../../../libs/platform/health/health.module';
import { ProblemDetailsFilter } from '../../../libs/platform/http/filters/problem-details.filter';
import { ResponseEnvelopeInterceptor } from '../../../libs/platform/http/interceptors/response-envelope.interceptor';
import { QueueModule } from '../../../libs/platform/queue/queue.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    HealthModule,
    QueueModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
})
export class WorkerModule {}
