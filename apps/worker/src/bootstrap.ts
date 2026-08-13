import 'reflect-metadata';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { loadDotEnvOnce } from '../../../libs/platform/config/dotenv';
import { createNestFastifyApp } from '../../../libs/platform/http/nest-fastify-app';

export async function createWorkerApp(): Promise<NestFastifyApplication> {
  await loadDotEnvOnce();
  const { WorkerModule } = await import('./worker.module');

  return await createNestFastifyApp(WorkerModule);
}
