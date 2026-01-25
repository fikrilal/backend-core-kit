import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { EnvVarsDb } from './env.schema.db';

export class EnvVarsAuth extends EnvVarsDb {
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
}
