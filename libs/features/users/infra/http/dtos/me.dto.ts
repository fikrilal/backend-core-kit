import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEmail, IsString } from 'class-validator';

export class MeDto {
  @ApiProperty({ example: '3d2c7b2a-2dd6-46a5-8f8e-3b5de8a5b0f0' })
  @IsString()
  id!: string;

  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: false })
  emailVerified!: boolean;

  @ApiProperty({ example: ['USER'] })
  @IsArray()
  @IsString({ each: true })
  roles!: string[];
}

export class MeEnvelopeDto {
  @ApiProperty({ type: MeDto })
  data!: MeDto;
}
