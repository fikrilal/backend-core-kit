import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from '../../../libs/platform/config/env.validation';
import { PrismaModule } from '../../../libs/platform/db/prisma.module';
import { HealthModule } from '../../../libs/platform/health/health.module';
import { ProblemDetailsFilter } from '../../../libs/platform/http/filters/problem-details.filter';
import { ResponseEnvelopeInterceptor } from '../../../libs/platform/http/interceptors/response-envelope.interceptor';
import { LoggingModule } from '../../../libs/platform/logging/logging.module';
import { PlatformEmailModule } from '../../../libs/platform/email/email.module';
import { QueueModule } from '../../../libs/platform/queue/queue.module';
import { SystemSmokeWorker } from './jobs/system-smoke.worker';
import { AuthEmailVerificationWorker } from './jobs/auth-email-verification.worker';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    LoggingModule.forRoot('worker'),
    PrismaModule,
    HealthModule,
    PlatformEmailModule,
    QueueModule,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
    SystemSmokeWorker,
    AuthEmailVerificationWorker,
  ],
})
export class WorkerModule {}
