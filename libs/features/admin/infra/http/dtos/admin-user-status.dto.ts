import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import type { AdminUserStatus } from '../../../app/admin-users.types';

const ADMIN_USER_STATUS_VALUES = ['ACTIVE', 'SUSPENDED'] as const;

export class SetAdminUserStatusRequestDto {
  @ApiProperty({ enum: ADMIN_USER_STATUS_VALUES, example: 'SUSPENDED' })
  @IsString()
  @IsIn(ADMIN_USER_STATUS_VALUES)
  status!: AdminUserStatus;

  @ApiPropertyOptional({
    type: String,
    example: 'Abuse detected',
    nullable: true,
    description: 'Internal-only admin note for why the user is suspended.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  reason?: string | null;
}
