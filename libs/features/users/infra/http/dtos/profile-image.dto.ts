import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsString, IsUUID, Max, Min } from 'class-validator';
import {
  PROFILE_IMAGE_ALLOWED_CONTENT_TYPES,
  PROFILE_IMAGE_MAX_BYTES,
} from '../../../app/profile-image.policy';

export class CreateProfileImageUploadRequestDto {
  @ApiProperty({
    enum: PROFILE_IMAGE_ALLOWED_CONTENT_TYPES,
    example: 'image/webp',
    description:
      'Declared MIME type for the upload. Must match the Content-Type used during upload.',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsIn(PROFILE_IMAGE_ALLOWED_CONTENT_TYPES)
  contentType!: (typeof PROFILE_IMAGE_ALLOWED_CONTENT_TYPES)[number];

  @ApiProperty({
    example: 123456,
    minimum: 1,
    maximum: PROFILE_IMAGE_MAX_BYTES,
    description: 'Declared size of the upload in bytes (used to verify the stored object).',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(PROFILE_IMAGE_MAX_BYTES)
  sizeBytes!: number;
}

export class PresignedUploadDto {
  @ApiProperty({ enum: ['PUT'], example: 'PUT' })
  method!: 'PUT';

  @ApiProperty({ example: 'https://<r2-presigned-url>' })
  url!: string;

  @ApiProperty({
    type: Object,
    example: { 'Content-Type': 'image/webp' },
    description: 'Headers that must be sent with the upload request.',
  })
  headers!: Record<string, string>;
}

export class ProfileImageUploadPlanDto {
  @ApiProperty({ example: '3d2c7b2a-2dd6-46a5-8f8e-3b5de8a5b0f0' })
  fileId!: string;

  @ApiProperty({ type: PresignedUploadDto })
  upload!: PresignedUploadDto;

  @ApiProperty({ example: '2026-01-10T12:34:56.789Z', format: 'date-time' })
  expiresAt!: string;
}

export class ProfileImageUploadPlanEnvelopeDto {
  @ApiProperty({ type: ProfileImageUploadPlanDto })
  data!: ProfileImageUploadPlanDto;
}

export class ProfileImageUrlDto {
  @ApiProperty({ example: 'https://<r2-presigned-url>' })
  url!: string;

  @ApiProperty({ example: '2026-01-10T12:34:56.789Z', format: 'date-time' })
  expiresAt!: string;
}

export class ProfileImageUrlEnvelopeDto {
  @ApiProperty({ type: ProfileImageUrlDto })
  data!: ProfileImageUrlDto;
}

export class CompleteProfileImageUploadRequestDto {
  @ApiProperty({ example: '3d2c7b2a-2dd6-46a5-8f8e-3b5de8a5b0f0' })
  @IsUUID()
  fileId!: string;
}
