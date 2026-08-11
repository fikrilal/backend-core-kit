import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

const OIDC_PROVIDER_VALUES = ['GOOGLE'] as const;

export class OidcExchangeRequestDto {
  @ApiProperty({ enum: OIDC_PROVIDER_VALUES, example: 'GOOGLE' })
  @IsString()
  @IsIn(OIDC_PROVIDER_VALUES)
  provider!: (typeof OIDC_PROVIDER_VALUES)[number];

  @ApiProperty({ example: '<oidc-id-token>' })
  @IsString()
  @MinLength(1)
  idToken!: string;

  @ApiProperty({ required: false, description: 'Stable per-device identifier (recommended).' })
  @IsOptional()
  @IsString()
  deviceId?: string;

  @ApiProperty({ required: false, description: 'Human-friendly device name (optional).' })
  @IsOptional()
  @IsString()
  deviceName?: string;
}

export class OidcConnectRequestDto {
  @ApiProperty({ enum: OIDC_PROVIDER_VALUES, example: 'GOOGLE' })
  @IsString()
  @IsIn(OIDC_PROVIDER_VALUES)
  provider!: (typeof OIDC_PROVIDER_VALUES)[number];

  @ApiProperty({ example: '<oidc-id-token>' })
  @IsString()
  @MinLength(1)
  idToken!: string;
}
