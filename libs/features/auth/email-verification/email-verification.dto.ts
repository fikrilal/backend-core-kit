import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class VerifyEmailRequestDto {
  @ApiProperty({ example: '<verification-token>' })
  @IsString()
  @MinLength(1)
  token!: string;
}
