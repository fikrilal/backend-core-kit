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

export enum PushProvider {
  Fcm = 'FCM',
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

  // HTTP / proxies
  // When true, Fastify will trust `X-Forwarded-*` headers and `req.ip` will reflect the client IP
  // behind a reverse proxy/load balancer. Only enable when traffic is guaranteed to come through
  // trusted proxies (otherwise clients can spoof these headers).
  @Transform(({ value }) => parseEnvBoolean(value))
  @IsOptional()
  @IsBoolean()
  HTTP_TRUST_PROXY?: boolean;

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

  @Transform(({ value }) => (value !== undefined ? Number(value) : 60 * 60 * 24))
  @IsOptional()
  @IsInt()
  @Min(1)
  AUTH_EMAIL_VERIFICATION_TOKEN_TTL_SECONDS: number = 60 * 60 * 24;

  @Transform(({ value }) => (value !== undefined ? Number(value) : 60 * 30))
  @IsOptional()
  @IsInt()
  @Min(60)
  AUTH_PASSWORD_RESET_TOKEN_TTL_SECONDS: number = 60 * 30;

  @Transform(({ value }) => (value !== undefined ? Number(value) : 60))
  @IsOptional()
  @IsInt()
  @Min(1)
  AUTH_EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS: number = 60;

  @Transform(({ value }) => (value !== undefined ? Number(value) : 30))
  @IsOptional()
  @IsInt()
  @Min(1)
  AUTH_EMAIL_VERIFICATION_RESEND_IP_MAX_ATTEMPTS: number = 30;

  @Transform(({ value }) => (value !== undefined ? Number(value) : 5 * 60))
  @IsOptional()
  @IsInt()
  @Min(1)
  AUTH_EMAIL_VERIFICATION_RESEND_IP_WINDOW_SECONDS: number = 5 * 60;

  @Transform(({ value }) => (value !== undefined ? Number(value) : 15 * 60))
  @IsOptional()
  @IsInt()
  @Min(1)
  AUTH_EMAIL_VERIFICATION_RESEND_IP_BLOCK_SECONDS: number = 15 * 60;

  @Transform(({ value }) => (value !== undefined ? Number(value) : 60))
  @IsOptional()
  @IsInt()
  @Min(1)
  AUTH_PASSWORD_RESET_REQUEST_COOLDOWN_SECONDS: number = 60;

  @Transform(({ value }) => (value !== undefined ? Number(value) : 20))
  @IsOptional()
  @IsInt()
  @Min(1)
  AUTH_PASSWORD_RESET_REQUEST_IP_MAX_ATTEMPTS: number = 20;

  @Transform(({ value }) => (value !== undefined ? Number(value) : 5 * 60))
  @IsOptional()
  @IsInt()
  @Min(1)
  AUTH_PASSWORD_RESET_REQUEST_IP_WINDOW_SECONDS: number = 5 * 60;

  @Transform(({ value }) => (value !== undefined ? Number(value) : 15 * 60))
  @IsOptional()
  @IsInt()
  @Min(1)
  AUTH_PASSWORD_RESET_REQUEST_IP_BLOCK_SECONDS: number = 15 * 60;

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

  // Users
  @Transform(({ value }) => (value !== undefined ? Number(value) : 20))
  @IsOptional()
  @IsInt()
  @Min(1)
  USERS_PROFILE_IMAGE_UPLOAD_USER_MAX_ATTEMPTS: number = 20;

  @Transform(({ value }) => (value !== undefined ? Number(value) : 60 * 60))
  @IsOptional()
  @IsInt()
  @Min(1)
  USERS_PROFILE_IMAGE_UPLOAD_USER_WINDOW_SECONDS: number = 60 * 60;

  @Transform(({ value }) => (value !== undefined ? Number(value) : 15 * 60))
  @IsOptional()
  @IsInt()
  @Min(1)
  USERS_PROFILE_IMAGE_UPLOAD_USER_BLOCK_SECONDS: number = 15 * 60;

  @Transform(({ value }) => (value !== undefined ? Number(value) : 60))
  @IsOptional()
  @IsInt()
  @Min(1)
  USERS_PROFILE_IMAGE_UPLOAD_IP_MAX_ATTEMPTS: number = 60;

  @Transform(({ value }) => (value !== undefined ? Number(value) : 5 * 60))
  @IsOptional()
  @IsInt()
  @Min(1)
  USERS_PROFILE_IMAGE_UPLOAD_IP_WINDOW_SECONDS: number = 5 * 60;

  @Transform(({ value }) => (value !== undefined ? Number(value) : 15 * 60))
  @IsOptional()
  @IsInt()
  @Min(1)
  USERS_PROFILE_IMAGE_UPLOAD_IP_BLOCK_SECONDS: number = 15 * 60;

  @Transform(({ value }) => (value !== undefined ? Number(value) : 2 * 60 * 60))
  @IsOptional()
  @IsInt()
  @Min(1)
  USERS_PROFILE_IMAGE_UPLOAD_EXPIRE_DELAY_SECONDS: number = 2 * 60 * 60;

  @IsOptional()
  @IsString()
  AUTH_JWT_ALG?: string;

  @IsOptional()
  @IsString()
  AUTH_SIGNING_KEYS_JSON?: string;

  @IsOptional()
  @IsString()
  AUTH_OIDC_GOOGLE_CLIENT_IDS?: string;

  // Public client URLs (frontend/mobile)
  @IsOptional()
  @IsUrl({ require_tld: false })
  PUBLIC_APP_URL?: string;

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

  // Email (Resend)
  @IsOptional()
  @IsString()
  RESEND_API_KEY?: string;

  @IsOptional()
  @IsString()
  EMAIL_FROM?: string;

  @IsOptional()
  @IsString()
  EMAIL_REPLY_TO?: string;

  // Push notifications (FCM)
  @Transform(({ value }) => (value !== undefined ? String(value).trim().toUpperCase() : undefined))
  @IsOptional()
  @IsEnum(PushProvider)
  PUSH_PROVIDER?: PushProvider;

  @IsOptional()
  @IsString()
  FCM_PROJECT_ID?: string;

  // Prefer a file path in production (secrets mount), but allow JSON for convenience.
  @IsOptional()
  @IsString()
  FCM_SERVICE_ACCOUNT_JSON_PATH?: string;

  @IsOptional()
  @IsString()
  FCM_SERVICE_ACCOUNT_JSON?: string;

  @Transform(({ value }) => parseEnvBoolean(value))
  @IsOptional()
  @IsBoolean()
  FCM_USE_APPLICATION_DEFAULT?: boolean;

  // Object storage (S3-compatible; e.g. Cloudflare R2)
  @IsOptional()
  @IsUrl({ require_tld: false })
  STORAGE_S3_ENDPOINT?: string;

  @IsOptional()
  @IsString()
  STORAGE_S3_REGION?: string;

  @IsOptional()
  @IsString()
  STORAGE_S3_BUCKET?: string;

  @IsOptional()
  @IsString()
  STORAGE_S3_ACCESS_KEY_ID?: string;

  @IsOptional()
  @IsString()
  STORAGE_S3_SECRET_ACCESS_KEY?: string;

  @Transform(({ value }) => parseEnvBoolean(value))
  @IsOptional()
  @IsBoolean()
  STORAGE_S3_FORCE_PATH_STYLE?: boolean;
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
  if (env.HTTP_TRUST_PROXY === undefined) missing.push('HTTP_TRUST_PROXY');
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

function assertEmailConfigConsistency(env: EnvVars) {
  const resendKey = env.RESEND_API_KEY?.trim();
  const emailFrom = env.EMAIL_FROM?.trim();

  const hasResendKey = typeof resendKey === 'string' && resendKey !== '';
  const hasFrom = typeof emailFrom === 'string' && emailFrom !== '';

  if (hasResendKey && !hasFrom) {
    throw new Error(
      'Missing required environment variables: EMAIL_FROM (required when RESEND_API_KEY is set)',
    );
  }

  if (hasFrom && !hasResendKey) {
    throw new Error(
      'Missing required environment variables: RESEND_API_KEY (required when EMAIL_FROM is set)',
    );
  }
}

function assertStorageConfigConsistency(env: EnvVars) {
  const endpoint = env.STORAGE_S3_ENDPOINT?.trim();
  const region = env.STORAGE_S3_REGION?.trim();
  const bucket = env.STORAGE_S3_BUCKET?.trim();
  const accessKeyId = env.STORAGE_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = env.STORAGE_S3_SECRET_ACCESS_KEY?.trim();

  const configured = Boolean(
    endpoint ||
    region ||
    bucket ||
    accessKeyId ||
    secretAccessKey ||
    env.STORAGE_S3_FORCE_PATH_STYLE,
  );
  if (!configured) return;

  const missing: string[] = [];
  if (!endpoint) missing.push('STORAGE_S3_ENDPOINT');
  if (!region) missing.push('STORAGE_S3_REGION');
  if (!bucket) missing.push('STORAGE_S3_BUCKET');
  if (!accessKeyId) missing.push('STORAGE_S3_ACCESS_KEY_ID');
  if (!secretAccessKey) missing.push('STORAGE_S3_SECRET_ACCESS_KEY');

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(
        ', ',
      )} (required when STORAGE_S3_* is set)`,
    );
  }
}

function assertPushConfigConsistency(env: EnvVars) {
  const provider = env.PUSH_PROVIDER;

  const hasAnyPushEnv = Boolean(
    provider ||
    env.FCM_PROJECT_ID?.trim() ||
    env.FCM_SERVICE_ACCOUNT_JSON_PATH?.trim() ||
    env.FCM_SERVICE_ACCOUNT_JSON?.trim() ||
    env.FCM_USE_APPLICATION_DEFAULT,
  );

  if (!hasAnyPushEnv) return;

  if (!provider) {
    throw new Error(
      'Missing required environment variables: PUSH_PROVIDER (required when FCM_* is set)',
    );
  }

  if (provider !== PushProvider.Fcm) {
    throw new Error(`Unsupported PUSH_PROVIDER: ${provider}`);
  }

  const missing: string[] = [];

  const projectId = env.FCM_PROJECT_ID?.trim();
  if (!projectId) missing.push('FCM_PROJECT_ID');

  const useAdc = env.FCM_USE_APPLICATION_DEFAULT === true;
  const hasServiceAccountPath = Boolean(env.FCM_SERVICE_ACCOUNT_JSON_PATH?.trim());
  const hasServiceAccountJson = Boolean(env.FCM_SERVICE_ACCOUNT_JSON?.trim());

  if (!useAdc && !hasServiceAccountPath && !hasServiceAccountJson) {
    missing.push('FCM_SERVICE_ACCOUNT_JSON_PATH or FCM_SERVICE_ACCOUNT_JSON');
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')} (required when PUSH_PROVIDER=FCM)`,
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
  assertEmailConfigConsistency(validated);
  assertPushConfigConsistency(validated);
  assertStorageConfigConsistency(validated);
  return validated;
}
