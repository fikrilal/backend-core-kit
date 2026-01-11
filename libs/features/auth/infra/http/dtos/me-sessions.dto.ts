import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

const SESSION_STATUS_VALUES = ['active', 'revoked', 'expired'] as const;

export class MeSessionIdParamDto {
  @ApiProperty({ example: '3d2c7b2a-2dd6-46a5-8f8e-3b5de8a5b0f0' })
  @IsUUID()
  sessionId!: string;
}

export class MeSessionDto {
  @ApiProperty({ example: '3d2c7b2a-2dd6-46a5-8f8e-3b5de8a5b0f0' })
  @IsString()
  id!: string;

  @ApiPropertyOptional({ type: String, example: 'device-a', nullable: true })
  @IsOptional()
  @IsString()
  deviceId!: string | null;

  @ApiPropertyOptional({ type: String, example: 'iPhone 15', nullable: true })
  @IsOptional()
  @IsString()
  deviceName!: string | null;

  @ApiProperty({ example: '2026-01-10T12:34:56.789Z', format: 'date-time' })
  @IsString()
  createdAt!: string;

  @ApiProperty({ example: '2026-02-10T12:34:56.789Z', format: 'date-time' })
  @IsString()
  expiresAt!: string;

  @ApiPropertyOptional({
    type: String,
    example: '2026-01-10T12:34:56.789Z',
    format: 'date-time',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  revokedAt!: string | null;

  @ApiProperty({ example: true })
  @IsBoolean()
  current!: boolean;

  @ApiProperty({ enum: SESSION_STATUS_VALUES, example: 'active' })
  @IsString()
  @IsIn(SESSION_STATUS_VALUES)
  status!: (typeof SESSION_STATUS_VALUES)[number];
}

export class CursorPaginationMetaDto {
  @ApiProperty({ example: 25 })
  @IsInt()
  @Min(1)
  limit!: number;

  @ApiProperty({ example: true })
  @IsBoolean()
  hasMore!: boolean;

  @ApiPropertyOptional({ example: 'eyJ2IjoxLCJzb3J0IjoiLWNyZWF0ZWRBdCIsImFmdGVyIjp7fX0' })
  @IsOptional()
  @IsString()
  nextCursor?: string;
}

export class MeSessionsListEnvelopeDto {
  @ApiProperty({ type: [MeSessionDto] })
  data!: MeSessionDto[];

  @ApiProperty({ type: CursorPaginationMetaDto })
  meta!: CursorPaginationMetaDto;
}
