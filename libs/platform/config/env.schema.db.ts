import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { EnvVarsHttp } from './env.schema.http';
import { parseEnvBoolean } from './env.transforms';

export class EnvVarsDb extends EnvVarsHttp {
  // Database
  @IsOptional()
  @IsString()
  DATABASE_URL?: string;

  // Postgres SSL (required by some providers like Heroku Postgres)
  @Transform(({ value }) => {
    if (value === undefined) return true;
    const parsed = parseEnvBoolean(value);
    return parsed === undefined ? true : parsed;
  })
  @IsBoolean()
  DATABASE_SSL_REJECT_UNAUTHORIZED: boolean = true;

  // Redis / BullMQ
  @IsOptional()
  @IsString()
  REDIS_URL?: string;

  @Transform(({ value }) => {
    if (value === undefined) return true;
    const parsed = parseEnvBoolean(value);
    return parsed === undefined ? true : parsed;
  })
  @IsBoolean()
  REDIS_TLS_REJECT_UNAUTHORIZED: boolean = true;

  @Transform(({ value }) => (value !== undefined ? Number(value) : 10_000))
  @IsOptional()
  @IsInt()
  @Min(1)
  REDIS_CONNECT_TIMEOUT_MS: number = 10_000;

  @Transform(({ value }) => (value !== undefined ? Number(value) : 5_000))
  @IsOptional()
  @IsInt()
  @Min(1)
  REDIS_COMMAND_TIMEOUT_MS: number = 5_000;

  @Transform(({ value }) => (value !== undefined ? Number(value) : 2))
  @IsOptional()
  @IsInt()
  @Min(0)
  REDIS_MAX_RETRIES_PER_REQUEST: number = 2;

  @Transform(({ value }) => (value !== undefined ? Number(value) : 100))
  @IsOptional()
  @IsInt()
  @Min(1)
  REDIS_RETRY_BASE_DELAY_MS: number = 100;

  @Transform(({ value }) => (value !== undefined ? Number(value) : 2_000))
  @IsOptional()
  @IsInt()
  @Min(1)
  REDIS_RETRY_MAX_DELAY_MS: number = 2_000;

  @Transform(({ value }) => {
    if (value === undefined) return true;
    const parsed = parseEnvBoolean(value);
    return parsed === undefined ? true : parsed;
  })
  @IsOptional()
  @IsBoolean()
  REDIS_ENABLE_OFFLINE_QUEUE: boolean = true;
}
