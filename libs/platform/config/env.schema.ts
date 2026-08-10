import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, IsUrl, Min } from 'class-validator';
import {
  AUTH_CONFIG_DEFAULTS,
  DATABASE_CONFIG_DEFAULTS,
  HTTP_CONFIG_DEFAULTS,
  REDIS_CONFIG_DEFAULTS,
  USERS_CONFIG_DEFAULTS,
} from './env.defaults';
import { NodeEnv, PushProvider } from './env.enums';
import { parseEnvBoolean } from './env-parsing';
import { TransformEnvBoolean } from './env.transforms';
import { LogLevel } from './log-level';

export class EnvVars {
  // Runtime / HTTP
  @Transform(({ value }) => (value !== undefined ? String(value) : NodeEnv.Development))
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  // When true, Fastify will trust `X-Forwarded-*` headers and `req.ip` will reflect the client IP
  // behind a reverse proxy/load balancer. Only enable when traffic is guaranteed to come through
  // trusted proxies (otherwise clients can spoof these headers).
  @TransformEnvBoolean()
  @IsOptional()
  @IsBoolean()
  HTTP_TRUST_PROXY?: boolean;

  @Transform(({ value }) =>
    value !== undefined ? Number(value) : HTTP_CONFIG_DEFAULTS.HTTP_CONNECTION_TIMEOUT_MS,
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  HTTP_CONNECTION_TIMEOUT_MS: number = HTTP_CONFIG_DEFAULTS.HTTP_CONNECTION_TIMEOUT_MS;

  @Transform(({ value }) =>
    value !== undefined ? Number(value) : HTTP_CONFIG_DEFAULTS.HTTP_KEEP_ALIVE_TIMEOUT_MS,
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  HTTP_KEEP_ALIVE_TIMEOUT_MS: number = HTTP_CONFIG_DEFAULTS.HTTP_KEEP_ALIVE_TIMEOUT_MS;

  @Transform(({ value }) =>
    value !== undefined ? Number(value) : HTTP_CONFIG_DEFAULTS.HTTP_REQUEST_TIMEOUT_MS,
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  HTTP_REQUEST_TIMEOUT_MS: number = HTTP_CONFIG_DEFAULTS.HTTP_REQUEST_TIMEOUT_MS;

  @Transform(({ value }) =>
    value !== undefined ? Number(value) : HTTP_CONFIG_DEFAULTS.HTTP_BODY_LIMIT_BYTES,
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  HTTP_BODY_LIMIT_BYTES: number = HTTP_CONFIG_DEFAULTS.HTTP_BODY_LIMIT_BYTES;

  @Transform(({ value }) =>
    value !== undefined ? Number(value) : HTTP_CONFIG_DEFAULTS.HTTP_PLUGIN_TIMEOUT_MS,
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  HTTP_PLUGIN_TIMEOUT_MS: number = HTTP_CONFIG_DEFAULTS.HTTP_PLUGIN_TIMEOUT_MS;

  @IsOptional()
  @IsString()
  HOST?: string;

  @Transform(({ value }) => (value !== undefined ? Number(value) : HTTP_CONFIG_DEFAULTS.PORT))
  @IsInt()
  @Min(0)
  PORT: number = HTTP_CONFIG_DEFAULTS.PORT;

  @IsOptional()
  @IsString()
  WORKER_HOST?: string;

  @Transform(({ value }) =>
    value !== undefined ? Number(value) : HTTP_CONFIG_DEFAULTS.WORKER_PORT,
  )
  @IsInt()
  @Min(0)
  WORKER_PORT: number = HTTP_CONFIG_DEFAULTS.WORKER_PORT;

  @TransformEnvBoolean()
  @IsOptional()
  @IsBoolean()
  SWAGGER_UI_ENABLED?: boolean;

  // Database
  @IsOptional()
  @IsString()
  DATABASE_URL?: string;

  // Postgres SSL (required by some providers like Heroku Postgres)
  @Transform(({ value }) => {
    if (value === undefined) return DATABASE_CONFIG_DEFAULTS.DATABASE_SSL_REJECT_UNAUTHORIZED;
    const parsed = parseEnvBoolean(value);
    return parsed === undefined
      ? DATABASE_CONFIG_DEFAULTS.DATABASE_SSL_REJECT_UNAUTHORIZED
      : parsed;
  })
  @IsBoolean()
  DATABASE_SSL_REJECT_UNAUTHORIZED: boolean =
    DATABASE_CONFIG_DEFAULTS.DATABASE_SSL_REJECT_UNAUTHORIZED;

  // Redis / BullMQ
  @IsOptional()
  @IsString()
  REDIS_URL?: string;

  @Transform(({ value }) => {
    if (value === undefined) return REDIS_CONFIG_DEFAULTS.REDIS_TLS_REJECT_UNAUTHORIZED;
    const parsed = parseEnvBoolean(value);
    return parsed === undefined ? REDIS_CONFIG_DEFAULTS.REDIS_TLS_REJECT_UNAUTHORIZED : parsed;
  })
  @IsBoolean()
  REDIS_TLS_REJECT_UNAUTHORIZED: boolean = REDIS_CONFIG_DEFAULTS.REDIS_TLS_REJECT_UNAUTHORIZED;

  @Transform(({ value }) =>
    value !== undefined ? Number(value) : REDIS_CONFIG_DEFAULTS.REDIS_CONNECT_TIMEOUT_MS,
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  REDIS_CONNECT_TIMEOUT_MS: number = REDIS_CONFIG_DEFAULTS.REDIS_CONNECT_TIMEOUT_MS;

  @Transform(({ value }) =>
    value !== undefined ? Number(value) : REDIS_CONFIG_DEFAULTS.REDIS_COMMAND_TIMEOUT_MS,
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  REDIS_COMMAND_TIMEOUT_MS: number = REDIS_CONFIG_DEFAULTS.REDIS_COMMAND_TIMEOUT_MS;

  @Transform(({ value }) =>
    value !== undefined ? Number(value) : REDIS_CONFIG_DEFAULTS.REDIS_MAX_RETRIES_PER_REQUEST,
  )
  @IsOptional()
  @IsInt()
  @Min(0)
  REDIS_MAX_RETRIES_PER_REQUEST: number = REDIS_CONFIG_DEFAULTS.REDIS_MAX_RETRIES_PER_REQUEST;

  @Transform(({ value }) =>
    value !== undefined ? Number(value) : REDIS_CONFIG_DEFAULTS.REDIS_RETRY_BASE_DELAY_MS,
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  REDIS_RETRY_BASE_DELAY_MS: number = REDIS_CONFIG_DEFAULTS.REDIS_RETRY_BASE_DELAY_MS;

  @Transform(({ value }) =>
    value !== undefined ? Number(value) : REDIS_CONFIG_DEFAULTS.REDIS_RETRY_MAX_DELAY_MS,
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  REDIS_RETRY_MAX_DELAY_MS: number = REDIS_CONFIG_DEFAULTS.REDIS_RETRY_MAX_DELAY_MS;

  @Transform(({ value }) => {
    if (value === undefined) return REDIS_CONFIG_DEFAULTS.REDIS_ENABLE_OFFLINE_QUEUE;
    const parsed = parseEnvBoolean(value);
    return parsed === undefined ? REDIS_CONFIG_DEFAULTS.REDIS_ENABLE_OFFLINE_QUEUE : parsed;
  })
  @IsOptional()
  @IsBoolean()
  REDIS_ENABLE_OFFLINE_QUEUE: boolean = REDIS_CONFIG_DEFAULTS.REDIS_ENABLE_OFFLINE_QUEUE;

  // Auth (OIDC + first-party tokens)
  @IsOptional()
  @IsString()
  AUTH_ISSUER?: string;

  @IsOptional()
  @IsString()
  AUTH_AUDIENCE?: string;

  @Transform(({ value }) =>
    value !== undefined ? Number(value) : AUTH_CONFIG_DEFAULTS.AUTH_ACCESS_TOKEN_TTL_SECONDS,
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  AUTH_ACCESS_TOKEN_TTL_SECONDS: number = AUTH_CONFIG_DEFAULTS.AUTH_ACCESS_TOKEN_TTL_SECONDS;

  @Transform(({ value }) =>
    value !== undefined ? Number(value) : AUTH_CONFIG_DEFAULTS.AUTH_REFRESH_TOKEN_TTL_SECONDS,
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  AUTH_REFRESH_TOKEN_TTL_SECONDS: number = AUTH_CONFIG_DEFAULTS.AUTH_REFRESH_TOKEN_TTL_SECONDS;

  @Transform(({ value }) =>
    value !== undefined
      ? Number(value)
      : AUTH_CONFIG_DEFAULTS.AUTH_EMAIL_VERIFICATION_TOKEN_TTL_SECONDS,
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  AUTH_EMAIL_VERIFICATION_TOKEN_TTL_SECONDS: number =
    AUTH_CONFIG_DEFAULTS.AUTH_EMAIL_VERIFICATION_TOKEN_TTL_SECONDS;

  @Transform(({ value }) =>
    value !== undefined
      ? Number(value)
      : AUTH_CONFIG_DEFAULTS.AUTH_PASSWORD_RESET_TOKEN_TTL_SECONDS,
  )
  @IsOptional()
  @IsInt()
  @Min(60)
  AUTH_PASSWORD_RESET_TOKEN_TTL_SECONDS: number =
    AUTH_CONFIG_DEFAULTS.AUTH_PASSWORD_RESET_TOKEN_TTL_SECONDS;

  @Transform(({ value }) =>
    value !== undefined
      ? Number(value)
      : AUTH_CONFIG_DEFAULTS.AUTH_EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS,
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  AUTH_EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS: number =
    AUTH_CONFIG_DEFAULTS.AUTH_EMAIL_VERIFICATION_RESEND_COOLDOWN_SECONDS;

  @Transform(({ value }) =>
    value !== undefined
      ? Number(value)
      : AUTH_CONFIG_DEFAULTS.AUTH_EMAIL_VERIFICATION_RESEND_IP_MAX_ATTEMPTS,
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  AUTH_EMAIL_VERIFICATION_RESEND_IP_MAX_ATTEMPTS: number =
    AUTH_CONFIG_DEFAULTS.AUTH_EMAIL_VERIFICATION_RESEND_IP_MAX_ATTEMPTS;

  @Transform(({ value }) =>
    value !== undefined
      ? Number(value)
      : AUTH_CONFIG_DEFAULTS.AUTH_EMAIL_VERIFICATION_RESEND_IP_WINDOW_SECONDS,
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  AUTH_EMAIL_VERIFICATION_RESEND_IP_WINDOW_SECONDS: number =
    AUTH_CONFIG_DEFAULTS.AUTH_EMAIL_VERIFICATION_RESEND_IP_WINDOW_SECONDS;

  @Transform(({ value }) =>
    value !== undefined
      ? Number(value)
      : AUTH_CONFIG_DEFAULTS.AUTH_EMAIL_VERIFICATION_RESEND_IP_BLOCK_SECONDS,
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  AUTH_EMAIL_VERIFICATION_RESEND_IP_BLOCK_SECONDS: number =
    AUTH_CONFIG_DEFAULTS.AUTH_EMAIL_VERIFICATION_RESEND_IP_BLOCK_SECONDS;

  @Transform(({ value }) =>
    value !== undefined
      ? Number(value)
      : AUTH_CONFIG_DEFAULTS.AUTH_PASSWORD_RESET_REQUEST_COOLDOWN_SECONDS,
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  AUTH_PASSWORD_RESET_REQUEST_COOLDOWN_SECONDS: number =
    AUTH_CONFIG_DEFAULTS.AUTH_PASSWORD_RESET_REQUEST_COOLDOWN_SECONDS;

  @Transform(({ value }) =>
    value !== undefined
      ? Number(value)
      : AUTH_CONFIG_DEFAULTS.AUTH_PASSWORD_RESET_REQUEST_IP_MAX_ATTEMPTS,
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  AUTH_PASSWORD_RESET_REQUEST_IP_MAX_ATTEMPTS: number =
    AUTH_CONFIG_DEFAULTS.AUTH_PASSWORD_RESET_REQUEST_IP_MAX_ATTEMPTS;

  @Transform(({ value }) =>
    value !== undefined
      ? Number(value)
      : AUTH_CONFIG_DEFAULTS.AUTH_PASSWORD_RESET_REQUEST_IP_WINDOW_SECONDS,
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  AUTH_PASSWORD_RESET_REQUEST_IP_WINDOW_SECONDS: number =
    AUTH_CONFIG_DEFAULTS.AUTH_PASSWORD_RESET_REQUEST_IP_WINDOW_SECONDS;

  @Transform(({ value }) =>
    value !== undefined
      ? Number(value)
      : AUTH_CONFIG_DEFAULTS.AUTH_PASSWORD_RESET_REQUEST_IP_BLOCK_SECONDS,
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  AUTH_PASSWORD_RESET_REQUEST_IP_BLOCK_SECONDS: number =
    AUTH_CONFIG_DEFAULTS.AUTH_PASSWORD_RESET_REQUEST_IP_BLOCK_SECONDS;

  @Transform(({ value }) =>
    value !== undefined ? Number(value) : AUTH_CONFIG_DEFAULTS.AUTH_PASSWORD_MIN_LENGTH,
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  AUTH_PASSWORD_MIN_LENGTH: number = AUTH_CONFIG_DEFAULTS.AUTH_PASSWORD_MIN_LENGTH;

  @Transform(({ value }) =>
    value !== undefined ? Number(value) : AUTH_CONFIG_DEFAULTS.AUTH_LOGIN_MAX_ATTEMPTS,
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  AUTH_LOGIN_MAX_ATTEMPTS: number = AUTH_CONFIG_DEFAULTS.AUTH_LOGIN_MAX_ATTEMPTS;

  @Transform(({ value }) =>
    value !== undefined ? Number(value) : AUTH_CONFIG_DEFAULTS.AUTH_LOGIN_WINDOW_SECONDS,
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  AUTH_LOGIN_WINDOW_SECONDS: number = AUTH_CONFIG_DEFAULTS.AUTH_LOGIN_WINDOW_SECONDS;

  @Transform(({ value }) =>
    value !== undefined ? Number(value) : AUTH_CONFIG_DEFAULTS.AUTH_LOGIN_BLOCK_SECONDS,
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  AUTH_LOGIN_BLOCK_SECONDS: number = AUTH_CONFIG_DEFAULTS.AUTH_LOGIN_BLOCK_SECONDS;

  @IsOptional()
  @IsString()
  AUTH_JWT_ALG?: string;

  @IsOptional()
  @IsString()
  AUTH_SIGNING_KEYS_JSON?: string;

  // Heroku/CI-friendly: store signing keys JSON as base64 to avoid quoting issues.
  @IsOptional()
  @IsString()
  AUTH_SIGNING_KEYS_JSON_BASE64?: string;

  @IsOptional()
  @IsString()
  AUTH_OIDC_GOOGLE_CLIENT_IDS?: string;

  // Users
  @Transform(({ value }) =>
    value !== undefined
      ? Number(value)
      : USERS_CONFIG_DEFAULTS.USERS_PROFILE_IMAGE_UPLOAD_USER_MAX_ATTEMPTS,
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  USERS_PROFILE_IMAGE_UPLOAD_USER_MAX_ATTEMPTS: number =
    USERS_CONFIG_DEFAULTS.USERS_PROFILE_IMAGE_UPLOAD_USER_MAX_ATTEMPTS;

  @Transform(({ value }) =>
    value !== undefined
      ? Number(value)
      : USERS_CONFIG_DEFAULTS.USERS_PROFILE_IMAGE_UPLOAD_USER_WINDOW_SECONDS,
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  USERS_PROFILE_IMAGE_UPLOAD_USER_WINDOW_SECONDS: number =
    USERS_CONFIG_DEFAULTS.USERS_PROFILE_IMAGE_UPLOAD_USER_WINDOW_SECONDS;

  @Transform(({ value }) =>
    value !== undefined
      ? Number(value)
      : USERS_CONFIG_DEFAULTS.USERS_PROFILE_IMAGE_UPLOAD_USER_BLOCK_SECONDS,
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  USERS_PROFILE_IMAGE_UPLOAD_USER_BLOCK_SECONDS: number =
    USERS_CONFIG_DEFAULTS.USERS_PROFILE_IMAGE_UPLOAD_USER_BLOCK_SECONDS;

  @Transform(({ value }) =>
    value !== undefined
      ? Number(value)
      : USERS_CONFIG_DEFAULTS.USERS_PROFILE_IMAGE_UPLOAD_IP_MAX_ATTEMPTS,
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  USERS_PROFILE_IMAGE_UPLOAD_IP_MAX_ATTEMPTS: number =
    USERS_CONFIG_DEFAULTS.USERS_PROFILE_IMAGE_UPLOAD_IP_MAX_ATTEMPTS;

  @Transform(({ value }) =>
    value !== undefined
      ? Number(value)
      : USERS_CONFIG_DEFAULTS.USERS_PROFILE_IMAGE_UPLOAD_IP_WINDOW_SECONDS,
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  USERS_PROFILE_IMAGE_UPLOAD_IP_WINDOW_SECONDS: number =
    USERS_CONFIG_DEFAULTS.USERS_PROFILE_IMAGE_UPLOAD_IP_WINDOW_SECONDS;

  @Transform(({ value }) =>
    value !== undefined
      ? Number(value)
      : USERS_CONFIG_DEFAULTS.USERS_PROFILE_IMAGE_UPLOAD_IP_BLOCK_SECONDS,
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  USERS_PROFILE_IMAGE_UPLOAD_IP_BLOCK_SECONDS: number =
    USERS_CONFIG_DEFAULTS.USERS_PROFILE_IMAGE_UPLOAD_IP_BLOCK_SECONDS;

  @Transform(({ value }) =>
    value !== undefined
      ? Number(value)
      : USERS_CONFIG_DEFAULTS.USERS_PROFILE_IMAGE_UPLOAD_EXPIRE_DELAY_SECONDS,
  )
  @IsOptional()
  @IsInt()
  @Min(1)
  USERS_PROFILE_IMAGE_UPLOAD_EXPIRE_DELAY_SECONDS: number =
    USERS_CONFIG_DEFAULTS.USERS_PROFILE_IMAGE_UPLOAD_EXPIRE_DELAY_SECONDS;

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

  @TransformEnvBoolean()
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

  // Heroku/CI-friendly: store the service account JSON as base64 to avoid quoting/newline issues.
  @IsOptional()
  @IsString()
  FCM_SERVICE_ACCOUNT_JSON_BASE64?: string;

  @IsOptional()
  @IsString()
  FCM_SERVICE_ACCOUNT_JSON?: string;

  @TransformEnvBoolean()
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

  @TransformEnvBoolean()
  @IsOptional()
  @IsBoolean()
  STORAGE_S3_FORCE_PATH_STYLE?: boolean;
}
