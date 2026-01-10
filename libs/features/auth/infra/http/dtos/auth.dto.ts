import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class AuthUserDto {
  @ApiProperty({ example: '3d2c7b2a-2dd6-46a5-8f8e-3b5de8a5b0f0' })
  @IsString()
  id!: string;

  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: false })
  emailVerified!: boolean;
}

export class AuthResultDto {
  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;

  @ApiProperty({ example: '<access-token>' })
  @IsString()
  accessToken!: string;

  @ApiProperty({ example: '<refresh-token>' })
  @IsString()
  refreshToken!: string;
}

export class AuthResultEnvelopeDto {
  @ApiProperty({ type: AuthResultDto })
  data!: AuthResultDto;
}

export class PasswordRegisterRequestDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 10 })
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

export class RefreshRequestDto {
  @ApiProperty({ example: '<refresh-token>' })
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}

export class LogoutRequestDto {
  @ApiProperty({ example: '<refresh-token>' })
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}
