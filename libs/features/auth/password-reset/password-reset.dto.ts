import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { resolveAuthPasswordMinLength } from '../../../platform/config/auth-password-policy';

const AUTH_PASSWORD_MIN_LENGTH: number = resolveAuthPasswordMinLength(process.env);

export class PasswordResetRequestDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;
}

export class PasswordResetConfirmRequestDto {
  @ApiProperty({ example: '<password-reset-token>' })
  @IsString()
  @MinLength(1)
  token!: string;

  @ApiProperty({ minLength: AUTH_PASSWORD_MIN_LENGTH })
  @IsString()
  @MinLength(AUTH_PASSWORD_MIN_LENGTH)
  newPassword!: string;
}
