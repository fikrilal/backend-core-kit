import { initTelemetry } from '../../../libs/platform/otel/telemetry';
import { loadDotEnvOnce } from '../../../libs/platform/config/dotenv';

function getEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

async function bootstrap() {
  await loadDotEnvOnce();

  const telemetry = await initTelemetry('worker');
  const shutdownTelemetry = () => void telemetry.shutdown().catch(() => undefined);
  process.once('SIGTERM', shutdownTelemetry);
  process.once('SIGINT', shutdownTelemetry);

  try {
    const { createWorkerApp } = await import('./bootstrap');
    const app = await createWorkerApp();

    const port = getEnvNumber('WORKER_PORT', 4001);
    const nodeEnv = process.env.NODE_ENV ?? 'development';
    const host = process.env.WORKER_HOST ?? (nodeEnv === 'production' ? '0.0.0.0' : '127.0.0.1');

    await app.listen({ port, host });
  } catch (err) {
    await telemetry.shutdown().catch(() => undefined);
    throw err;
  }
}

void bootstrap().catch((err) => {
  const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
