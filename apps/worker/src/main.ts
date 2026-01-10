import { createWorkerApp } from './bootstrap';

function getEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

async function bootstrap() {
  const app = await createWorkerApp();

  const port = getEnvNumber('WORKER_PORT', 4001);
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const host = process.env.WORKER_HOST ?? (nodeEnv === 'production' ? '0.0.0.0' : '127.0.0.1');

  await app.listen({ port, host });
}

bootstrap();
