import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, IsUUID } from 'class-validator';
import type { AdminUserRole } from '../../../app/admin-users.types';

const ADMIN_USER_ROLE_VALUES = ['USER', 'ADMIN'] as const;

export class AdminUserIdParamDto {
  @ApiProperty({ example: '3d2c7b2a-2dd6-46a5-8f8e-3b5de8a5b0f0' })
  @IsUUID()
  userId!: string;
}

export class SetAdminUserRoleRequestDto {
  @ApiProperty({ enum: ADMIN_USER_ROLE_VALUES, example: 'USER' })
  @IsString()
  @IsIn(ADMIN_USER_ROLE_VALUES)
  role!: AdminUserRole;
}
