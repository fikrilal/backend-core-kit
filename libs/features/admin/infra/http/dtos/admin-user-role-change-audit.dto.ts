import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

const ADMIN_USER_ROLE_VALUES = ['USER', 'ADMIN'] as const;

export class AdminUserRoleChangeAuditDto {
  @ApiProperty({ example: '3d2c7b2a-2dd6-46a5-8f8e-3b5de8a5b0f0' })
  @IsString()
  id!: string;

  @ApiProperty({ example: '3d2c7b2a-2dd6-46a5-8f8e-3b5de8a5b0f0' })
  @IsString()
  actorUserId!: string;

  @ApiProperty({ example: 'c1b6c1f7-5b2f-4e53-b33b-5af7f63a8c40' })
  @IsString()
  actorSessionId!: string;

  @ApiProperty({ example: '9d8c7b2a-2dd6-46a5-8f8e-3b5de8a5b0f0' })
  @IsString()
  targetUserId!: string;

  @ApiProperty({ enum: ADMIN_USER_ROLE_VALUES, example: 'USER' })
  @IsString()
  oldRole!: (typeof ADMIN_USER_ROLE_VALUES)[number];

  @ApiProperty({ enum: ADMIN_USER_ROLE_VALUES, example: 'ADMIN' })
  @IsString()
  newRole!: (typeof ADMIN_USER_ROLE_VALUES)[number];

  @ApiProperty({
    example: '66b3b91d-7b52-4a4d-a71d-f2ea8db4a99c',
    description: 'Equals X-Request-Id from the role change request.',
  })
  @IsString()
  traceId!: string;

  @ApiProperty({ example: '2026-01-10T12:34:56.789Z', format: 'date-time' })
  @IsString()
  createdAt!: string;
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

export class AdminUserRoleChangeAuditsListEnvelopeDto {
  @ApiProperty({ type: [AdminUserRoleChangeAuditDto] })
  @IsArray()
  data!: AdminUserRoleChangeAuditDto[];

  @ApiProperty({ type: CursorPaginationMetaDto })
  meta!: CursorPaginationMetaDto;
}
