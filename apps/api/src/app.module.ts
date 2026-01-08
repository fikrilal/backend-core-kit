import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from '../../../libs/platform/health/health.module';
import { ResponseEnvelopeInterceptor } from '../../../libs/platform/http/interceptors/response-envelope.interceptor';
import { ProblemDetailsFilter } from '../../../libs/platform/http/filters/problem-details.filter';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), HealthModule],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: ResponseEnvelopeInterceptor },
    { provide: APP_FILTER, useClass: ProblemDetailsFilter },
  ],
})
export class AppModule {}

