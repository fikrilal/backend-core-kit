import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';
import type { AdminUserRole } from '../../../app/admin-users.types';
import { CursorPaginationMetaDto } from './cursor-pagination-meta.dto';

const ADMIN_USER_ROLE_VALUES = ['USER', 'ADMIN'] as const;
const ADMIN_USER_STATUS_VALUES = ['ACTIVE', 'SUSPENDED', 'DELETED'] as const;

export class AdminUserDto {
  @ApiProperty({ example: '3d2c7b2a-2dd6-46a5-8f8e-3b5de8a5b0f0' })
  @IsString()
  id!: string;

  @ApiProperty({ example: 'user@example.com' })
  @IsString()
  email!: string;

  @ApiProperty({ example: false })
  @IsBoolean()
  emailVerified!: boolean;

  @ApiProperty({ example: ['USER'] })
  @IsArray()
  @IsString({ each: true })
  @IsIn(ADMIN_USER_ROLE_VALUES, { each: true })
  roles!: AdminUserRole[];

  @ApiProperty({ enum: ADMIN_USER_STATUS_VALUES, example: 'ACTIVE' })
  @IsString()
  status!: (typeof ADMIN_USER_STATUS_VALUES)[number];

  @ApiPropertyOptional({
    type: String,
    example: '2026-01-10T12:34:56.789Z',
    format: 'date-time',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  suspendedAt!: string | null;

  @ApiPropertyOptional({
    type: String,
    example: 'Abuse detected',
    nullable: true,
    description: 'Internal-only admin note for why the user is suspended.',
  })
  @IsOptional()
  @IsString()
  suspendedReason!: string | null;

  @ApiProperty({ example: '2026-01-10T12:34:56.789Z', format: 'date-time' })
  @IsString()
  createdAt!: string;
}

export class AdminUsersListEnvelopeDto {
  @ApiProperty({ type: [AdminUserDto] })
  data!: AdminUserDto[];

  @ApiProperty({ type: CursorPaginationMetaDto })
  meta!: CursorPaginationMetaDto;
}

export class AdminUserEnvelopeDto {
  @ApiProperty({ type: AdminUserDto })
  data!: AdminUserDto;
}
