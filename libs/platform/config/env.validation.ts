import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Min,
  validateSync,
} from 'class-validator';
import { LogLevel } from './log-level';

export enum NodeEnv {
  Development = 'development',
  Test = 'test',
  Staging = 'staging',
  Production = 'production',
}

function parseEnvBoolean(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'boolean') return value;

  const normalized = String(value).trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return undefined;
}

class EnvVars {
  @Transform(({ value }) => (value !== undefined ? String(value) : NodeEnv.Development))
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsOptional()
  @IsString()
  HOST?: string;

  @Transform(({ value }) => (value !== undefined ? Number(value) : 4000))
  @IsInt()
  @Min(0)
  PORT: number = 4000;

  @IsOptional()
  @IsString()
  WORKER_HOST?: string;

  @Transform(({ value }) => (value !== undefined ? Number(value) : 4001))
  @IsInt()
  @Min(0)
  WORKER_PORT: number = 4001;

  @Transform(({ value }) => parseEnvBoolean(value))
  @IsOptional()
  @IsBoolean()
  SWAGGER_UI_ENABLED?: boolean;

  // Database
  @IsOptional()
  @IsString()
  DATABASE_URL?: string;

  // Redis / BullMQ
  @IsOptional()
  @IsString()
  REDIS_URL?: string;

  // Auth (OIDC + first-party tokens)
  @IsOptional()
  @IsString()
  AUTH_ISSUER?: string;

  @IsOptional()
  @IsString()
  AUTH_AUDIENCE?: string;

  @Transform(({ value }) => (value !== undefined ? Number(value) : 900))
  @IsOptional()
  @IsInt()
  @Min(1)
  AUTH_ACCESS_TOKEN_TTL_SECONDS: number = 900;

  @Transform(({ value }) => (value !== undefined ? Number(value) : 60 * 60 * 24 * 30))
  @IsOptional()
  @IsInt()
  @Min(1)
  AUTH_REFRESH_TOKEN_TTL_SECONDS: number = 60 * 60 * 24 * 30;

  @Transform(({ value }) => (value !== undefined ? Number(value) : 10))
  @IsOptional()
  @IsInt()
  @Min(1)
  AUTH_PASSWORD_MIN_LENGTH: number = 10;

  @Transform(({ value }) => (value !== undefined ? Number(value) : 10))
  @IsOptional()
  @IsInt()
  @Min(1)
  AUTH_LOGIN_MAX_ATTEMPTS: number = 10;

  @Transform(({ value }) => (value !== undefined ? Number(value) : 60))
  @IsOptional()
  @IsInt()
  @Min(1)
  AUTH_LOGIN_WINDOW_SECONDS: number = 60;

  @Transform(({ value }) => (value !== undefined ? Number(value) : 15 * 60))
  @IsOptional()
  @IsInt()
  @Min(1)
  AUTH_LOGIN_BLOCK_SECONDS: number = 15 * 60;

  @IsOptional()
  @IsString()
  AUTH_JWT_ALG?: string;

  @IsOptional()
  @IsString()
  AUTH_SIGNING_KEYS_JSON?: string;

  // Observability (Grafana Cloud via OTLP)
  @IsOptional()
  @IsString()
  OTEL_SERVICE_NAME?: string;

  @IsOptional()
  @IsUrl({ require_tld: false })
  OTEL_EXPORTER_OTLP_ENDPOINT?: string;

  @IsOptional()
  @IsString()
  OTEL_EXPORTER_OTLP_HEADERS?: string;

  // Logging
  @Transform(({ value }) => (value !== undefined ? String(value).trim().toLowerCase() : undefined))
  @IsOptional()
  @IsEnum(LogLevel)
  LOG_LEVEL?: LogLevel;

  @Transform(({ value }) => parseEnvBoolean(value))
  @IsOptional()
  @IsBoolean()
  LOG_PRETTY?: boolean;
}

function formatValidationErrors(errors: unknown[]): string {
  const messages: string[] = [];

  for (const error of errors) {
    if (!error || typeof error !== 'object') continue;
    const e = error as {
      property?: string;
      constraints?: Record<string, string>;
      children?: unknown[];
    };

    const property = typeof e.property === 'string' ? e.property : 'unknown';
    if (e.constraints) {
      for (const msg of Object.values(e.constraints)) {
        messages.push(`${property}: ${msg}`);
      }
    }

    if (Array.isArray(e.children) && e.children.length > 0) {
      messages.push(formatValidationErrors(e.children));
    }
  }

  return messages.filter((m) => m.trim() !== '').join('; ');
}

function requireInProductionLike(env: EnvVars) {
  const productionLike = env.NODE_ENV === NodeEnv.Production || env.NODE_ENV === NodeEnv.Staging;
  if (!productionLike) return;

  const missing: string[] = [];
  if (!env.DATABASE_URL) missing.push('DATABASE_URL');
  if (!env.REDIS_URL) missing.push('REDIS_URL');
  if (!env.AUTH_ISSUER) missing.push('AUTH_ISSUER');
  if (!env.AUTH_AUDIENCE) missing.push('AUTH_AUDIENCE');
  if (!env.OTEL_SERVICE_NAME) missing.push('OTEL_SERVICE_NAME');
  if (!env.OTEL_EXPORTER_OTLP_ENDPOINT) missing.push('OTEL_EXPORTER_OTLP_ENDPOINT');

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables for ${env.NODE_ENV}: ${missing.join(', ')}`,
    );
  }
}

export function validateEnv(config: Record<string, unknown>): EnvVars {
  const validated = plainToInstance(EnvVars, config, { enableImplicitConversion: true });
  const errors = validateSync(validated, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(`Invalid environment variables: ${formatValidationErrors(errors)}`);
  }

  requireInProductionLike(validated);
  return validated;
}
