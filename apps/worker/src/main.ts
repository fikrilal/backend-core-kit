import { initTelemetry } from '../../../libs/platform/otel/telemetry';
import { loadDotEnvOnce } from '../../../libs/platform/config/dotenv';
import { HTTP_CONFIG_DEFAULTS } from '../../../libs/platform/config/env.defaults';
import { asEnvNumber } from '../../../libs/platform/config/env-parsing';

async function bootstrap() {
  await loadDotEnvOnce();

  const telemetry = await initTelemetry('worker');
  const shutdownTelemetry = () => void telemetry.shutdown().catch(() => undefined);
  process.once('SIGTERM', shutdownTelemetry);
  process.once('SIGINT', shutdownTelemetry);

  try {
    const { createWorkerApp } = await import('./bootstrap');
    const app = await createWorkerApp();

    const port = asEnvNumber(process.env.WORKER_PORT, HTTP_CONFIG_DEFAULTS.WORKER_PORT);
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
