import { createApiApp } from './bootstrap';
import { buildOpenApiDocument, isSwaggerUiEnabled, setupSwaggerUi } from './openapi';

function getEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

async function bootstrap() {
  const app = await createApiApp();

  if (isSwaggerUiEnabled()) {
    const document = buildOpenApiDocument(app);
    setupSwaggerUi(app, document);
  }

  const port = getEnvNumber('PORT', 4000);
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const host = process.env.HOST ?? (nodeEnv === 'production' ? '0.0.0.0' : '127.0.0.1');

  await app.listen({ port, host });
}

bootstrap();
