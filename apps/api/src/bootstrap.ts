import 'reflect-metadata';
import { RequestMethod } from '@nestjs/common';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { loadDotEnvOnce } from '../../../libs/platform/config/dotenv';
import { createNestFastifyApp } from '../../../libs/platform/http/nest-fastify-app';

export async function createApiApp(): Promise<NestFastifyApplication> {
  await loadDotEnvOnce();
  const { AppModule } = await import('./app.module');

  return await createNestFastifyApp(AppModule, (app) => {
    // Versioned API prefix; keep health/readiness unversioned.
    app.setGlobalPrefix('v1', {
      exclude: [
        { path: 'health', method: RequestMethod.GET },
        { path: 'ready', method: RequestMethod.GET },
        { path: '.well-known/jwks.json', method: RequestMethod.GET },
      ],
    });
  });
}
