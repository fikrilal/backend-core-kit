import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString } from 'class-validator';
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
}
