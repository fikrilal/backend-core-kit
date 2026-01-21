import { IsOptional, IsString } from 'class-validator';
import { EnvVarsHttp } from './env.schema.http';

export class EnvVarsDb extends EnvVarsHttp {
  // Database
  @IsOptional()
  @IsString()
  DATABASE_URL?: string;

  // Redis / BullMQ
  @IsOptional()
  @IsString()
  REDIS_URL?: string;
}
