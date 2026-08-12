import { initTelemetry } from '../../../libs/platform/otel/telemetry';
import { loadDotEnvOnce } from '../../../libs/platform/config/dotenv';
import { HTTP_CONFIG_DEFAULTS } from '../../../libs/platform/config/env.defaults';
import { asEnvNumber } from '../../../libs/platform/config/env-parsing';

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

    const port = asEnvNumber(process.env.PORT, HTTP_CONFIG_DEFAULTS.PORT);
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
