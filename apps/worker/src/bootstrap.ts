import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { ValidationError } from 'class-validator';
import { Logger } from 'nestjs-pino';
import { ErrorCode } from '../../../libs/platform/http/errors/error-codes';
import { ProblemException } from '../../../libs/platform/http/errors/problem.exception';
import { createFastifyAdapter } from '../../../libs/platform/http/fastify-adapter';
import { registerFastifyHttpPlatform } from '../../../libs/platform/http/fastify-hooks';
import { loadDotEnvOnce } from '../../../libs/platform/config/dotenv';

function flattenValidationErrors(
  errors: ValidationError[],
  prefix = '',
): Array<{ field?: string; message: string }> {
  const out: Array<{ field?: string; message: string }> = [];

  for (const error of errors) {
    const path = prefix ? `${prefix}.${error.property}` : error.property;

    if (error.constraints) {
      for (const message of Object.values(error.constraints)) {
        out.push({ field: path, message });
      }
    }

    if (error.children && error.children.length > 0) {
      out.push(...flattenValidationErrors(error.children, path));
    }
  }

  return out;
}

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
