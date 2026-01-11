import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

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
  roles!: string[];

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

export class AdminUsersListEnvelopeDto {
  @ApiProperty({ type: [AdminUserDto] })
  data!: AdminUserDto[];

  @ApiProperty({ type: CursorPaginationMetaDto })
  meta!: CursorPaginationMetaDto;
}
