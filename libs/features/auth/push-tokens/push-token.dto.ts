import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';
import { SESSION_PUSH_PLATFORMS, type SessionPushPlatform } from '../shared/ports/auth.repository';

export class MePushTokenUpsertRequestDto {
  @ApiProperty({
    enum: SESSION_PUSH_PLATFORMS,
    example: 'ANDROID',
    description: 'Client platform where the push token was minted.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @IsIn(SESSION_PUSH_PLATFORMS)
  platform!: SessionPushPlatform;

  @ApiProperty({
    example: '<fcm-registration-token>',
    maxLength: 2048,
    description: 'FCM registration token for this device/app install.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  token!: string;
}
