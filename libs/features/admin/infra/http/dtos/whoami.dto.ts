import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsString } from 'class-validator';

export class AdminWhoamiDto {
  @ApiProperty({ example: '3d2c7b2a-2dd6-46a5-8f8e-3b5de8a5b0f0' })
  @IsString()
  userId!: string;

  @ApiProperty({ example: 'c1b6c1f7-5b2f-4e53-b33b-5af7f63a8c40' })
  @IsString()
  sessionId!: string;

  @ApiProperty({ example: false })
  @IsBoolean()
  emailVerified!: boolean;

  @ApiProperty({ example: ['ADMIN'] })
  @IsArray()
  @IsString({ each: true })
  roles!: string[];
}

export class AdminWhoamiEnvelopeDto {
  @ApiProperty({ type: AdminWhoamiDto })
  data!: AdminWhoamiDto;
}
