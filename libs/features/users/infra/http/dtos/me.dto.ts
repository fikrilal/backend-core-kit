import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDefined,
  IsEmail,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';
import { AUTH_METHOD_VALUES } from '../../../../../shared/auth/auth-method';

const MAX_PROFILE_FIELD_LENGTH = 100;

function AtLeastOneDefined(fields: ReadonlyArray<string>, validationOptions?: ValidationOptions) {
  return (target: object, propertyName: string) => {
    registerDecorator({
      name: 'atLeastOneDefined',
      target: target.constructor,
      propertyName,
      constraints: [fields],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const keys = args.constraints[0] as ReadonlyArray<string>;
          if (value === null || typeof value !== 'object') return false;
          const obj = value as Record<string, unknown>;
          return keys.some((k) => obj[k] !== undefined);
        },
        defaultMessage(args: ValidationArguments): string {
          const keys = args.constraints[0] as ReadonlyArray<string>;
          return `At least one of ${keys.join(', ')} must be provided`;
        },
      },
    });
  };
}

export class MeProfileDto {
  @ApiPropertyOptional({ type: String, example: 'Dante', nullable: true })
  @IsOptional()
  @IsString()
  displayName!: string | null;

  @ApiPropertyOptional({ type: String, example: 'Dante', nullable: true })
  @IsOptional()
  @IsString()
  givenName!: string | null;

  @ApiPropertyOptional({ type: String, example: 'Alighieri', nullable: true })
  @IsOptional()
  @IsString()
  familyName!: string | null;
}

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

  @ApiProperty({
    isArray: true,
    enum: AUTH_METHOD_VALUES,
    example: ['PASSWORD'],
    description: 'Linked authentication methods on this account.',
  })
  @IsArray()
  @IsString({ each: true })
  authMethods!: string[];

  @ApiProperty({ type: MeProfileDto })
  profile!: MeProfileDto;
}

export class MeEnvelopeDto {
  @ApiProperty({ type: MeDto })
  data!: MeDto;
}

export class PatchMeProfileDto {
  @ApiPropertyOptional({
    type: String,
    example: 'Dante',
    nullable: true,
    minLength: 1,
    maxLength: MAX_PROFILE_FIELD_LENGTH,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_PROFILE_FIELD_LENGTH)
  displayName?: string | null;

  @ApiPropertyOptional({
    type: String,
    example: 'Dante',
    nullable: true,
    minLength: 1,
    maxLength: MAX_PROFILE_FIELD_LENGTH,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_PROFILE_FIELD_LENGTH)
  givenName?: string | null;

  @ApiPropertyOptional({
    type: String,
    example: 'Alighieri',
    nullable: true,
    minLength: 1,
    maxLength: MAX_PROFILE_FIELD_LENGTH,
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_PROFILE_FIELD_LENGTH)
  familyName?: string | null;
}

export class PatchMeRequestDto {
  @ApiProperty({ type: PatchMeProfileDto })
  @IsDefined()
  @IsObject()
  @ValidateNested()
  @Type(() => PatchMeProfileDto)
  @AtLeastOneDefined(['displayName', 'givenName', 'familyName'], {
    message: 'At least one profile field must be provided',
  })
  profile!: PatchMeProfileDto;
}
