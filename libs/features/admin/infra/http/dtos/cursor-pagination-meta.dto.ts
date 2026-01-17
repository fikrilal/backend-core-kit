import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

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

