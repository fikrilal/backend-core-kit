import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUrl } from 'class-validator';
import { LogLevel } from './log-level';
import { PushProvider } from './env.enums';
import { TransformEnvBoolean } from './env.transforms';
import { EnvVarsUsers } from './env.schema.users';

export class EnvVarsIntegrations extends EnvVarsUsers {
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
