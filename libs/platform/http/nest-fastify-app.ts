import { ValidationPipe, type Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { Logger } from 'nestjs-pino';
import { ErrorCode } from './errors/error-codes';
import { ProblemException } from './errors/problem.exception';
import { createFastifyAdapter } from './fastify-adapter';
import { registerFastifyHttpPlatform } from './fastify-hooks';
import { flattenValidationErrors } from './validation/validation-errors';

type ConfigureApp = (app: NestFastifyApplication) => void | Promise<void>;

export async function createNestFastifyApp(
  rootModule: Type<unknown>,
  configure?: ConfigureApp,
): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(rootModule, createFastifyAdapter(), {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));
  registerFastifyHttpPlatform(app);
  app.useGlobalPipes(createValidationPipe());

  if (configure) {
    await configure(app);
  }

  app.enableShutdownHooks();
  await app.init();

  return app;
}

function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new ProblemException(400, {
        title: 'Validation Failed',
        code: ErrorCode.VALIDATION_FAILED,
        errors: flattenValidationErrors(errors),
      }),
  });
}
