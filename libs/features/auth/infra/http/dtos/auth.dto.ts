import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEmail, IsIn, IsOptional, IsString } from 'class-validator';
import { AUTH_METHOD_VALUES } from '../../../../../shared/auth/auth-method';
import { MeDto } from '../../../../users/infra/http/dtos/me.dto';

export class AuthUserDto {
  @ApiProperty({ example: '3d2c7b2a-2dd6-46a5-8f8e-3b5de8a5b0f0' })
  @IsString()
  id!: string;

  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: false })
  emailVerified!: boolean;

  @ApiPropertyOptional({
    isArray: true,
    enum: AUTH_METHOD_VALUES,
    example: ['PASSWORD', 'GOOGLE'],
    description:
      'Linked authentication methods on this account. Omitted on token refresh responses.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsIn(AUTH_METHOD_VALUES, { each: true })
  authMethods?: string[];
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

export class AuthResultWithMeDto {
  @ApiProperty({ type: MeDto })
  user!: MeDto;

  @ApiProperty({ example: '<access-token>' })
  @IsString()
  accessToken!: string;

  @ApiProperty({ example: '<refresh-token>' })
  @IsString()
  refreshToken!: string;
}

export class AuthResultWithMeEnvelopeDto {
  @ApiProperty({ type: AuthResultWithMeDto })
  data!: AuthResultWithMeDto;
}
