import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';

export function buildOpenApiDocument(app: NestFastifyApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Backend Core Kit API')
    .setDescription('Generated API contract (code-first).')
    .setVersion('0.1.0')
    .addServer('/')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'First-party access token (Authorization: Bearer <token>)',
      },
      'access-token',
    )
    .addTag('Health', 'Service health and readiness endpoints.')
    .addTag('Auth', 'Authentication and session endpoints.')
    .build();

  return SwaggerModule.createDocument(app, config, {
    ignoreGlobalPrefix: false,
  });
}

export function setupSwaggerUi(app: NestFastifyApplication, document: OpenAPIObject) {
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
}

function parseEnvBoolean(raw: string | undefined): boolean | undefined {
  if (raw === undefined) return undefined;
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return undefined;
}

export function isSwaggerUiEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const nodeEnv = env.NODE_ENV ?? 'development';
  if (nodeEnv === 'production' || nodeEnv === 'test') return false;

  const override = parseEnvBoolean(env.SWAGGER_UI_ENABLED);
  return override ?? true;
}
