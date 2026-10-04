import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../platform/db/prisma.service';
import type {
  CreateMerchantApplicationParams,
  CreateMerchantApplicationResult,
  MerchantApplicationRecord,
  MerchantOnboardingRepository,
} from './merchant-onboarding.repository';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function uniqueConstraintTargets(err: unknown): ReadonlyArray<string> | undefined {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return undefined;
  if (err.code !== 'P2002') return undefined;

  const meta: unknown = err.meta;
  const targets: string[] = [];

  // Classic Prisma engine error shape.
  const target = isRecord(meta) ? Reflect.get(meta, 'target') : undefined;
  if (Array.isArray(target)) {
    for (const entry of target) {
      if (typeof entry === 'string') targets.push(entry);
    }
  } else if (typeof target === 'string') {
    targets.push(target);
  }

  // Driver-adapter error shape (Prisma driver adapters wrap the DB error).
  const driverAdapterError = isRecord(meta) ? Reflect.get(meta, 'driverAdapterError') : undefined;
  const cause = isRecord(driverAdapterError) ? Reflect.get(driverAdapterError, 'cause') : undefined;
  const constraint = isRecord(cause) ? Reflect.get(cause, 'constraint') : undefined;
  const fields = isRecord(constraint) ? Reflect.get(constraint, 'fields') : undefined;
  if (Array.isArray(fields)) {
    for (const field of fields) {
      if (typeof field === 'string') targets.push(field.replaceAll('"', ''));
    }
  }

  return targets;
}

function toRecord(params: CreateMerchantApplicationParams, id: string): MerchantApplicationRecord {
  return {
    id,
    userId: params.userId,
    legalName: params.application.business.legalName,
    businessTypeId: params.application.business.businessTypeId,
    registrationNumber: params.application.business.registrationNumber,
    industryId: params.application.business.industryId,
    monthlySalesRangeId: params.application.business.monthlySalesRangeId,
    contactEmail: params.application.business.contactEmail,
    contactPhone: params.application.business.contactPhone,
    settlementBankId: params.application.settlement.bankId,
    accountHolderName: params.application.settlement.accountHolderName,
    settlementHolderTypeId: params.application.settlement.holderTypeId,
    settlementOwnerRowId: params.application.settlement.ownerRowId,
    accountNumberLast4: params.application.settlement.accountNumberLast4,
    payoutScheduleId: params.application.settlement.payoutScheduleId,
    termsVersion: params.application.termsVersion,
    submittedAt: params.submittedAt,
  };
}

@Injectable()
export class PrismaMerchantOnboardingRepository implements MerchantOnboardingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createApplication(
    params: CreateMerchantApplicationParams,
  ): Promise<CreateMerchantApplicationResult> {
    const application = params.application;

    if (
      application.settlement.ownerRowId !== null &&
      !application.owners.some((owner) => owner.ownerRowId === application.settlement.ownerRowId)
    ) {
      return { kind: 'invalid_owner_reference' };
    }

    let createdId: string;
    try {
      const created = await this.prisma.getClient().$transaction(async (tx) => {
        return await tx.merchantApplication.create({
          data: {
            userId: params.userId,
            legalName: application.business.legalName,
            businessTypeId: application.business.businessTypeId,
            registrationNumber: application.business.registrationNumber,
            industryId: application.business.industryId,
            monthlySalesRangeId: application.business.monthlySalesRangeId,
            contactEmail: application.business.contactEmail,
            contactPhone: application.business.contactPhone,
            settlementBankId: application.settlement.bankId,
            accountHolderName: application.settlement.accountHolderName,
            settlementHolderTypeId: application.settlement.holderTypeId,
            settlementOwnerRowId: application.settlement.ownerRowId,
            accountNumberLast4: application.settlement.accountNumberLast4,
            payoutScheduleId: application.settlement.payoutScheduleId,
            termsVersion: application.termsVersion,
            submittedAt: params.submittedAt,
            owners: {
              create: application.owners.map((owner) => ({
                clientRowId: owner.ownerRowId,
                fullName: owner.fullName,
                roleId: owner.roleId,
                ownershipBasisPoints: owner.ownershipBasisPoints,
                email: owner.email,
                isPrimaryContact: owner.isPrimaryContact,
              })),
            },
          },
          select: { id: true },
        });
      });
      createdId = created.id;
    } catch (err: unknown) {
      const targets = uniqueConstraintTargets(err);
      if (targets !== undefined) {
        if (targets.includes('userId')) return { kind: 'user_already_exists' };
        if (targets.includes('registrationNumber')) {
          return { kind: 'registration_already_exists' };
        }
      }
      throw err;
    }

    return { kind: 'created', application: toRecord(params, createdId) };
  }
}
