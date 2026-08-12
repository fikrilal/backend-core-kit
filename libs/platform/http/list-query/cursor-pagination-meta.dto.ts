import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CursorPaginationMetaDto {
  @ApiProperty({ example: 25 })
  limit!: number;

  @ApiProperty({ example: true })
  hasMore!: boolean;

  @ApiPropertyOptional({ example: 'eyJ2IjoxLCJzb3J0IjoiLWNyZWF0ZWRBdCIsImFmdGVyIjp7fX0' })
  nextCursor?: string;
}
