import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { ErrorCode } from '../../../libs/platform/http/errors/error-codes';
import { ProblemException } from '../../../libs/platform/http/errors/problem.exception';
import { createFastifyAdapter } from '../../../libs/platform/http/fastify-adapter';
import { registerFastifyHttpPlatform } from '../../../libs/platform/http/fastify-hooks';
import { loadDotEnvOnce } from '../../../libs/platform/config/dotenv';
import { flattenValidationErrors } from '../../../libs/platform/http/validation/validation-errors';

export async function createWorkerApp(): Promise<NestFastifyApplication> {
  await loadDotEnvOnce();
  const { WorkerModule } = await import('./worker.module');

  const app = await NestFactory.create<NestFastifyApplication>(
    WorkerModule,
    createFastifyAdapter(),
    {
      bufferLogs: true,
    },
  );
  app.useLogger(app.get(Logger));

  registerFastifyHttpPlatform(app);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) =>
        new ProblemException(400, {
          title: 'Validation Failed',
          code: ErrorCode.VALIDATION_FAILED,
          errors: flattenValidationErrors(errors),
        }),
    }),
  );

  app.enableShutdownHooks();
  await app.init();
  return app;
}
