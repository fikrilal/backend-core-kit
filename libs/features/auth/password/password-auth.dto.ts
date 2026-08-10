import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { resolveAuthPasswordMinLength } from '../../../platform/config/auth-password-policy';

const AUTH_PASSWORD_MIN_LENGTH: number = resolveAuthPasswordMinLength(process.env);

export class PasswordRegisterRequestDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: AUTH_PASSWORD_MIN_LENGTH })
  @IsString()
  @MinLength(AUTH_PASSWORD_MIN_LENGTH)
  password!: string;

  @ApiProperty({ required: false, description: 'Stable per-device identifier (recommended).' })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiProperty({ required: false, description: 'Human-friendly device name (optional).' })
  @IsOptional()
  @IsString()
  deviceName?: string;
}

export class PasswordLoginRequestDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 1 })
  @IsString()
  @MinLength(1)
  password!: string;

  @ApiProperty({ required: false, description: 'Stable per-device identifier (recommended).' })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiProperty({ required: false, description: 'Human-friendly device name (optional).' })
  @IsOptional()
  @IsString()
  deviceName?: string;
}

export class ChangePasswordRequestDto {
  @ApiProperty({ minLength: 1 })
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @ApiProperty({ minLength: AUTH_PASSWORD_MIN_LENGTH })
  @IsString()
  @MinLength(AUTH_PASSWORD_MIN_LENGTH)
  newPassword!: string;
}
