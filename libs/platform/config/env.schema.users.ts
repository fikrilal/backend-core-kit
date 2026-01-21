import { Transform } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { EnvVarsAuth } from './env.schema.auth';

export class EnvVarsUsers extends EnvVarsAuth {
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
}
