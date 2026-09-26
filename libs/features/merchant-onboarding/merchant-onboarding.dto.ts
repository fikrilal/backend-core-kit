import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDefined,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import type { MerchantOnboardingApplicationInput } from './merchant-onboarding.model';

const GROSS_STRING_LENGTH = 256;
const GROSS_ID_LENGTH = 64;
const GROSS_OWNER_ROWS = 32;

export class MerchantBusinessInputDto {
  @ApiProperty({ example: 'Acme Studio', maxLength: GROSS_STRING_LENGTH })
  @IsString()
  @MaxLength(GROSS_STRING_LENGTH)
  legalName!: string;

  @ApiProperty({ example: 'private_company', maxLength: GROSS_ID_LENGTH })
  @IsString()
  @MaxLength(GROSS_ID_LENGTH)
  businessTypeId!: string;

  @ApiPropertyOptional({
    type: String,
    example: 'REG-12345',
    nullable: true,
    maxLength: GROSS_ID_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(GROSS_ID_LENGTH)
  registrationNumber?: string | null;

  @ApiProperty({ example: 'digital_services', maxLength: GROSS_ID_LENGTH })
  @IsString()
  @MaxLength(GROSS_ID_LENGTH)
  industryId!: string;

  @ApiProperty({ example: '10m_to_50m_idr', maxLength: GROSS_ID_LENGTH })
  @IsString()
  @MaxLength(GROSS_ID_LENGTH)
  monthlySalesRangeId!: string;

  @ApiProperty({ example: 'owner@example.com' })
  @IsEmail()
  contactEmail!: string;

  @ApiProperty({ example: '+6281234567890', maxLength: 32 })
  @IsString()
  @MaxLength(32)
  contactPhone!: string;
}

export class MerchantOwnerInputDto {
  @ApiProperty({ example: 'a4591876-9c0c-4f8d-9df5-8fdd11ef13d8' })
  @IsUUID()
  ownerRowId!: string;

  @ApiProperty({ example: 'Ari Example', maxLength: GROSS_STRING_LENGTH })
  @IsString()
  @MaxLength(GROSS_STRING_LENGTH)
  fullName!: string;

  @ApiProperty({ example: 'owner', maxLength: GROSS_ID_LENGTH })
  @IsString()
  @MaxLength(GROSS_ID_LENGTH)
  roleId!: string;

  @ApiPropertyOptional({ example: 10000, nullable: true, type: 'integer' })
  @IsOptional()
  @IsInt()
  ownershipBasisPoints?: number | null;

  @ApiProperty({ example: 'owner@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  isPrimaryContact!: boolean;
}

export class MerchantSettlementInputDto {
  @ApiProperty({ example: 'demo_bank_alpha', maxLength: GROSS_ID_LENGTH })
  @IsString()
  @MaxLength(GROSS_ID_LENGTH)
  bankId!: string;

  @ApiProperty({ example: 'Ari Example', maxLength: GROSS_STRING_LENGTH })
  @IsString()
  @MaxLength(GROSS_STRING_LENGTH)
  accountHolderName!: string;

  @ApiProperty({ example: '0012345678', maxLength: GROSS_STRING_LENGTH })
  @IsString()
  @MaxLength(GROSS_STRING_LENGTH)
  accountNumber!: string;

  @ApiProperty({ example: 'owner', maxLength: GROSS_ID_LENGTH })
  @IsString()
  @MaxLength(GROSS_ID_LENGTH)
  holderTypeId!: string;

  @ApiPropertyOptional({
    type: String,
    example: 'a4591876-9c0c-4f8d-9df5-8fdd11ef13d8',
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  ownerRowId?: string | null;

  @ApiProperty({ example: 'weekly', maxLength: GROSS_ID_LENGTH })
  @IsString()
  @MaxLength(GROSS_ID_LENGTH)
  payoutScheduleId!: string;
}

export class MerchantDeclarationsInputDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  informationAccurate!: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  authorizedToSubmit!: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  termsAccepted!: boolean;

  @ApiProperty({ example: '2026-08-30', maxLength: GROSS_ID_LENGTH })
  @IsString()
  @MaxLength(GROSS_ID_LENGTH)
  termsVersion!: string;
}

export class MerchantOnboardingSubmitRequestDto {
  @ApiProperty({ type: MerchantBusinessInputDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => MerchantBusinessInputDto)
  business!: MerchantBusinessInputDto;

  @ApiProperty({ type: [MerchantOwnerInputDto], maxItems: GROSS_OWNER_ROWS })
  @IsArray()
  @ArrayMaxSize(GROSS_OWNER_ROWS)
  @ValidateNested({ each: true })
  @Type(() => MerchantOwnerInputDto)
  owners!: MerchantOwnerInputDto[];

  @ApiProperty({ type: MerchantSettlementInputDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => MerchantSettlementInputDto)
  settlement!: MerchantSettlementInputDto;

  @ApiProperty({ type: MerchantDeclarationsInputDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => MerchantDeclarationsInputDto)
  declarations!: MerchantDeclarationsInputDto;
}

export class MerchantLabeledOptionDto {
  @ApiProperty({ example: 'retail' })
  id!: string;

  @ApiProperty({ example: 'Retail' })
  label!: string;
}

export class MerchantBusinessTypeOptionDto {
  @ApiProperty({ example: 'private_company' })
  id!: string;

  @ApiProperty({ example: 'Private company' })
  label!: string;

  @ApiProperty({ example: true })
  requiresRegistrationNumber!: boolean;
}

export class MerchantOwnerRoleOptionDto {
  @ApiProperty({ example: 'owner' })
  id!: string;

  @ApiProperty({ example: 'Owner' })
  label!: string;

  @ApiProperty({ example: true })
  contributesOwnership!: boolean;
}

export class MerchantBankOptionDto {
  @ApiProperty({ example: 'demo_bank_alpha' })
  id!: string;

  @ApiProperty({ example: 'Demo Bank Alpha' })
  label!: string;

  @ApiProperty({ type: [String], example: ['daily', 'weekly'] })
  supportedPayoutScheduleIds!: string[];
}

export class MerchantAccountHolderTypeOptionDto {
  @ApiProperty({ example: 'owner' })
  id!: string;

  @ApiProperty({ example: 'Owner' })
  label!: string;

  @ApiProperty({ example: true })
  requiresOwnerReference!: boolean;
}

export class MerchantReferenceDataDto {
  @ApiProperty({ type: [MerchantBusinessTypeOptionDto] })
  businessTypes!: MerchantBusinessTypeOptionDto[];

  @ApiProperty({ type: [MerchantLabeledOptionDto] })
  industries!: MerchantLabeledOptionDto[];

  @ApiProperty({ type: [MerchantLabeledOptionDto] })
  monthlySalesRanges!: MerchantLabeledOptionDto[];

  @ApiProperty({ type: [MerchantOwnerRoleOptionDto] })
  ownerRoles!: MerchantOwnerRoleOptionDto[];

  @ApiProperty({ type: [MerchantBankOptionDto] })
  banks!: MerchantBankOptionDto[];

  @ApiProperty({ type: [MerchantAccountHolderTypeOptionDto] })
  accountHolderTypes!: MerchantAccountHolderTypeOptionDto[];

  @ApiProperty({ type: [MerchantLabeledOptionDto] })
  payoutSchedules!: MerchantLabeledOptionDto[];

  @ApiProperty({ example: '2026-08-30' })
  termsVersion!: string;
}

export class MerchantReferenceDataEnvelopeDto {
  @ApiProperty({ type: MerchantReferenceDataDto })
  data!: MerchantReferenceDataDto;
}

export class MerchantSubmitSettlementDto {
  @ApiProperty({ example: 'demo_bank_alpha' })
  bankId!: string;

  @ApiProperty({ example: '5678' })
  accountNumberLast4!: string;
}

export class MerchantSubmitResultDto {
  @ApiProperty({ example: 'a7a6ce74-f9aa-48a5-b39d-fcb44d349f33' })
  applicationId!: string;

  @ApiProperty({ example: '2026-08-30T10:00:00.000Z' })
  submittedAt!: string;

  @ApiProperty({ type: MerchantSubmitSettlementDto })
  settlement!: MerchantSubmitSettlementDto;
}

export class MerchantSubmitEnvelopeDto {
  @ApiProperty({ type: MerchantSubmitResultDto })
  data!: MerchantSubmitResultDto;
}

export function toMerchantOnboardingApplicationInput(
  dto: MerchantOnboardingSubmitRequestDto,
): MerchantOnboardingApplicationInput {
  return {
    business: {
      legalName: dto.business.legalName,
      businessTypeId: dto.business.businessTypeId,
      registrationNumber: dto.business.registrationNumber ?? null,
      industryId: dto.business.industryId,
      monthlySalesRangeId: dto.business.monthlySalesRangeId,
      contactEmail: dto.business.contactEmail,
      contactPhone: dto.business.contactPhone,
    },
    owners: dto.owners.map((owner) => ({
      ownerRowId: owner.ownerRowId,
      fullName: owner.fullName,
      roleId: owner.roleId,
      ownershipBasisPoints: owner.ownershipBasisPoints ?? null,
      email: owner.email,
      isPrimaryContact: owner.isPrimaryContact,
    })),
    settlement: {
      bankId: dto.settlement.bankId,
      accountHolderName: dto.settlement.accountHolderName,
      accountNumber: dto.settlement.accountNumber,
      holderTypeId: dto.settlement.holderTypeId,
      ownerRowId: dto.settlement.ownerRowId ?? null,
      payoutScheduleId: dto.settlement.payoutScheduleId,
    },
    declarations: {
      informationAccurate: dto.declarations.informationAccurate,
      authorizedToSubmit: dto.declarations.authorizedToSubmit,
      termsAccepted: dto.declarations.termsAccepted,
      termsVersion: dto.declarations.termsVersion,
    },
  };
}
