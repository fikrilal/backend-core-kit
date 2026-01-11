import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from '../../../libs/platform/health/health.module';
import { LoggingModule } from '../../../libs/platform/logging/logging.module';
import { QueueModule } from '../../../libs/platform/queue/queue.module';
import { IdempotencyModule } from '../../../libs/platform/http/idempotency/idempotency.module';
import { ResponseEnvelopeInterceptor } from '../../../libs/platform/http/interceptors/response-envelope.interceptor';
import { ProblemDetailsFilter } from '../../../libs/platform/http/filters/problem-details.filter';
import { validateEnv } from '../../../libs/platform/config/env.validation';
import { AuthModule } from '../../../libs/features/auth/infra/auth.module';
import { UsersModule } from '../../../libs/features/users/infra/users.module';
import { AdminModule } from '../../../libs/features/admin/infra/admin.module';
import { IdempotencyInterceptor } from '../../../libs/platform/http/idempotency/idempotency.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggingModule.forRoot('api'),
    HealthModule,
    QueueModule,
    IdempotencyModule,
    AuthModule,
    UsersModule,
    AdminModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
})
export class AppModule {}
