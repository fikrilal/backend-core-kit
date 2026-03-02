import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { NodeEnv } from './env.enums';
import { TransformEnvBoolean } from './env.transforms';

export class EnvVarsHttp {
  @Transform(({ value }) => (value !== undefined ? String(value) : NodeEnv.Development))
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  // HTTP / proxies
  // When true, Fastify will trust `X-Forwarded-*` headers and `req.ip` will reflect the client IP
  // behind a reverse proxy/load balancer. Only enable when traffic is guaranteed to come through
  // trusted proxies (otherwise clients can spoof these headers).
  @TransformEnvBoolean()
  @IsOptional()
  @IsBoolean()
  HTTP_TRUST_PROXY?: boolean;

  @Transform(({ value }) => (value !== undefined ? Number(value) : 10_000))
  @IsOptional()
  @IsInt()
  @Min(1)
  HTTP_CONNECTION_TIMEOUT_MS: number = 10_000;

  @Transform(({ value }) => (value !== undefined ? Number(value) : 72_000))
  @IsOptional()
  @IsInt()
  @Min(1)
  HTTP_KEEP_ALIVE_TIMEOUT_MS: number = 72_000;

  @Transform(({ value }) => (value !== undefined ? Number(value) : 30_000))
  @IsOptional()
  @IsInt()
  @Min(1)
  HTTP_REQUEST_TIMEOUT_MS: number = 30_000;

  @Transform(({ value }) => (value !== undefined ? Number(value) : 1_048_576))
  @IsOptional()
  @IsInt()
  @Min(1)
  HTTP_BODY_LIMIT_BYTES: number = 1_048_576;

  @Transform(({ value }) => (value !== undefined ? Number(value) : 10_000))
  @IsOptional()
  @IsInt()
  @Min(1)
  HTTP_PLUGIN_TIMEOUT_MS: number = 10_000;

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

  @TransformEnvBoolean()
  @IsOptional()
  @IsBoolean()
  SWAGGER_UI_ENABLED?: boolean;
}
