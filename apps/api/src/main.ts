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

  const telemetry = await initTelemetry('api');
  const shutdownTelemetry = () => void telemetry.shutdown().catch(() => undefined);
  process.once('SIGTERM', shutdownTelemetry);
  process.once('SIGINT', shutdownTelemetry);

  try {
    const { createApiApp } = await import('./bootstrap');
    const { buildOpenApiDocument, isSwaggerUiEnabled, setupSwaggerUi } = await import('./openapi');

    const app = await createApiApp();

    if (isSwaggerUiEnabled()) {
      const document = buildOpenApiDocument(app);
      setupSwaggerUi(app, document);
    }

    const port = getEnvNumber('PORT', 4000);
    const nodeEnv = process.env.NODE_ENV ?? 'development';
    const host = process.env.HOST ?? (nodeEnv === 'production' ? '0.0.0.0' : '127.0.0.1');

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
