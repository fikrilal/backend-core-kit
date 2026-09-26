import {
  findMerchantAccountHolderType,
  findMerchantBank,
  findMerchantBusinessType,
  findMerchantIndustry,
  findMerchantMonthlySalesRange,
  findMerchantOwnerRole,
  findMerchantPayoutSchedule,
  MERCHANT_ONBOARDING_TERMS_VERSION,
} from './merchant-onboarding.reference-data';
import type {
  MerchantOnboardingApplicationInput,
  MerchantOnboardingOwnerInput,
  MerchantOnboardingPolicyIssue,
  ValidatedMerchantOnboardingApplication,
  ValidatedMerchantOnboardingOwner,
} from './merchant-onboarding.model';

const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 100;
const REGISTRATION_NUMBER_PATTERN = /^[A-Z0-9-]{4,30}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+[1-9][0-9]{7,14}$/;
const ACCOUNT_NUMBER_PATTERN = /^[0-9]{6,24}$/;
const MIN_OWNERS = 1;
const MAX_OWNERS = 5;
const TOTAL_BASIS_POINTS = 10000;

export type MerchantOnboardingPolicyOutcome =
  | Readonly<{ kind: 'valid'; application: ValidatedMerchantOnboardingApplication }>
  | Readonly<{ kind: 'invalid'; issues: ReadonlyArray<MerchantOnboardingPolicyIssue> }>;

function issue(
  category: MerchantOnboardingPolicyIssue['category'],
  code: string,
  path: string,
  message: string,
): MerchantOnboardingPolicyIssue {
  return { category, code, path, message };
}

function fieldIssue(code: string, path: string, message: string): MerchantOnboardingPolicyIssue {
  return issue('field', code, path, message);
}

function referenceDataIssue(
  code: string,
  path: string,
  message: string,
): MerchantOnboardingPolicyIssue {
  return issue('reference_data', code, path, message);
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}

function normalizeName(value: string): string {
  return value.trim();
}

function isValidName(value: string): boolean {
  return value.length >= NAME_MIN_LENGTH && value.length <= NAME_MAX_LENGTH;
}

function validateBusiness(
  input: MerchantOnboardingApplicationInput['business'],
  issues: MerchantOnboardingPolicyIssue[],
): {
  legalName: string;
  businessTypeId: string;
  registrationNumber: string | null;
  industryId: string;
  monthlySalesRangeId: string;
  contactEmail: string;
  contactPhone: string;
} {
  const legalName = normalizeName(input.legalName);
  if (legalName === '') {
    issues.push(
      fieldIssue(
        'business.legal_name.required',
        'business.legalName',
        'Legal business name is required',
      ),
    );
  } else if (!isValidName(legalName)) {
    issues.push(
      fieldIssue(
        'business.legal_name.length',
        'business.legalName',
        'Legal business name must be 2-100 characters',
      ),
    );
  }

  const businessTypeId = input.businessTypeId.trim();
  const businessType = businessTypeId === '' ? undefined : findMerchantBusinessType(businessTypeId);
  if (businessTypeId === '') {
    issues.push(
      fieldIssue('business.type.required', 'business.businessTypeId', 'Business type is required'),
    );
  } else if (!businessType) {
    issues.push(
      referenceDataIssue(
        'business.type.unsupported',
        'business.businessTypeId',
        'Business type is not supported',
      ),
    );
  }

  const registrationRaw = input.registrationNumber?.trim() ?? '';
  let registrationNumber: string | null = null;
  if (registrationRaw === '') {
    if (businessType?.requiresRegistrationNumber) {
      issues.push(
        fieldIssue(
          'business.registration.required',
          'business.registrationNumber',
          'Registration number is required for this business type',
        ),
      );
    }
  } else {
    registrationNumber = registrationRaw.toUpperCase();
    if (!REGISTRATION_NUMBER_PATTERN.test(registrationNumber)) {
      issues.push(
        fieldIssue(
          'business.registration.invalid',
          'business.registrationNumber',
          'Registration number must be 4-30 uppercase letters, digits, or dashes',
        ),
      );
    }
  }

  const industryId = input.industryId.trim();
  if (industryId === '') {
    issues.push(
      fieldIssue('business.industry.required', 'business.industryId', 'Industry is required'),
    );
  } else if (!findMerchantIndustry(industryId)) {
    issues.push(
      referenceDataIssue(
        'business.industry.unsupported',
        'business.industryId',
        'Industry is not supported',
      ),
    );
  }

  const monthlySalesRangeId = input.monthlySalesRangeId.trim();
  if (monthlySalesRangeId === '') {
    issues.push(
      fieldIssue(
        'business.sales_range.required',
        'business.monthlySalesRangeId',
        'Monthly sales range is required',
      ),
    );
  } else if (!findMerchantMonthlySalesRange(monthlySalesRangeId)) {
    issues.push(
      referenceDataIssue(
        'business.sales_range.unsupported',
        'business.monthlySalesRangeId',
        'Monthly sales range is not supported',
      ),
    );
  }

  const contactEmail = normalizeEmail(input.contactEmail);
  if (contactEmail === '') {
    issues.push(
      fieldIssue('contact.email.required', 'business.contactEmail', 'Contact email is required'),
    );
  } else if (!isValidEmail(contactEmail)) {
    issues.push(
      fieldIssue(
        'contact.email.invalid',
        'business.contactEmail',
        'Contact email must be a valid email address',
      ),
    );
  }

  const contactPhone = input.contactPhone.trim();
  if (contactPhone === '') {
    issues.push(
      fieldIssue('contact.phone.required', 'business.contactPhone', 'Contact phone is required'),
    );
  } else if (!PHONE_PATTERN.test(contactPhone)) {
    issues.push(
      fieldIssue(
        'contact.phone.invalid',
        'business.contactPhone',
        'Contact phone must be a valid E.164 number',
      ),
    );
  }

  return {
    legalName,
    businessTypeId,
    registrationNumber,
    industryId,
    monthlySalesRangeId,
    contactEmail,
    contactPhone,
  };
}

function validateOwners(
  input: ReadonlyArray<MerchantOnboardingOwnerInput>,
  issues: MerchantOnboardingPolicyIssue[],
): ReadonlyArray<ValidatedMerchantOnboardingOwner> {
  if (input.length < MIN_OWNERS) {
    issues.push(fieldIssue('owners.required', 'owners', 'At least one owner is required'));
  }
  if (input.length > MAX_OWNERS) {
    issues.push(fieldIssue('owners.limit.exceeded', 'owners', 'At most 5 owners are allowed'));
  }

  const seenRowIds = new Set<string>();
  const firstRowIdByEmail = new Map<string, string>();
  const owners: ValidatedMerchantOnboardingOwner[] = [];
  let primaryCount = 0;
  let totalBasisPoints = 0;

  for (const row of input) {
    const rowPath = `owners.${row.ownerRowId}`;

    if (seenRowIds.has(row.ownerRowId)) {
      issues.push(
        fieldIssue(
          'owners.row_id.duplicate',
          `${rowPath}.ownerRowId`,
          'Owner row ID duplicates an earlier row',
        ),
      );
    }
    seenRowIds.add(row.ownerRowId);

    const fullName = normalizeName(row.fullName);
    if (fullName === '') {
      issues.push(
        fieldIssue('owner.name.required', `${rowPath}.fullName`, 'Owner full name is required'),
      );
    } else if (!isValidName(fullName)) {
      issues.push(
        fieldIssue(
          'owner.name.length',
          `${rowPath}.fullName`,
          'Owner full name must be 2-100 characters',
        ),
      );
    }

    const role = findMerchantOwnerRole(row.roleId);
    if (row.roleId === '') {
      issues.push(fieldIssue('owner.role.required', `${rowPath}.roleId`, 'Owner role is required'));
    } else if (!role) {
      issues.push(
        referenceDataIssue(
          'owner.role.unsupported',
          `${rowPath}.roleId`,
          'Owner role is not supported',
        ),
      );
    }

    let ownershipBasisPoints: number | null = row.ownershipBasisPoints;
    if (role?.contributesOwnership) {
      if (ownershipBasisPoints === null) {
        issues.push(
          fieldIssue(
            'owner.percentage.required',
            `${rowPath}.ownershipBasisPoints`,
            'Ownership percentage is required for this role',
          ),
        );
      } else if (
        !Number.isInteger(ownershipBasisPoints) ||
        ownershipBasisPoints < 1 ||
        ownershipBasisPoints > TOTAL_BASIS_POINTS
      ) {
        issues.push(
          fieldIssue(
            'owner.percentage.invalid',
            `${rowPath}.ownershipBasisPoints`,
            'Ownership percentage must be between 1 and 10000 basis points',
          ),
        );
      } else {
        totalBasisPoints += ownershipBasisPoints;
      }
    } else if (ownershipBasisPoints !== null) {
      issues.push(
        fieldIssue(
          'owner.percentage.not_allowed',
          `${rowPath}.ownershipBasisPoints`,
          'Ownership percentage is not allowed for this role',
        ),
      );
      ownershipBasisPoints = null;
    }

    const email = normalizeEmail(row.email);
    if (email === '') {
      issues.push(
        fieldIssue('owner.email.required', `${rowPath}.email`, 'Owner email is required'),
      );
    } else if (!isValidEmail(email)) {
      issues.push(
        fieldIssue(
          'owner.email.invalid',
          `${rowPath}.email`,
          'Owner email must be a valid email address',
        ),
      );
    } else {
      const firstRowId = firstRowIdByEmail.get(email);
      if (firstRowId !== undefined) {
        issues.push(
          fieldIssue(
            'owners.email.duplicate',
            `${rowPath}.email`,
            'Owner email duplicates an earlier owner',
          ),
        );
      } else {
        firstRowIdByEmail.set(email, row.ownerRowId);
      }
    }

    if (row.isPrimaryContact) {
      primaryCount += 1;
    }

    owners.push({
      ownerRowId: row.ownerRowId,
      fullName,
      roleId: row.roleId,
      ownershipBasisPoints,
      email,
      isPrimaryContact: row.isPrimaryContact,
    });
  }

  if (primaryCount !== 1) {
    issues.push(
      fieldIssue(
        'owners.primary.invalid',
        'owners',
        'Exactly one owner must be the primary contact',
      ),
    );
  }

  if (totalBasisPoints !== TOTAL_BASIS_POINTS) {
    issues.push(
      fieldIssue('owners.total.invalid', 'owners', 'Ownership percentages must total exactly 100%'),
    );
  }

  return owners;
}

function validateSettlement(
  input: MerchantOnboardingApplicationInput['settlement'],
  owners: ReadonlyArray<ValidatedMerchantOnboardingOwner>,
  issues: MerchantOnboardingPolicyIssue[],
): {
  bankId: string;
  accountHolderName: string;
  accountNumberLast4: string;
  holderTypeId: string;
  ownerRowId: string | null;
  payoutScheduleId: string;
} {
  const bankId = input.bankId.trim();
  const bank = bankId === '' ? undefined : findMerchantBank(bankId);
  if (bankId === '') {
    issues.push(fieldIssue('settlement.bank.required', 'settlement.bankId', 'Bank is required'));
  } else if (!bank) {
    issues.push(
      referenceDataIssue(
        'settlement.bank.unsupported',
        'settlement.bankId',
        'Bank is not supported',
      ),
    );
  }

  const accountHolderName = normalizeName(input.accountHolderName);
  if (accountHolderName === '') {
    issues.push(
      fieldIssue(
        'settlement.holder_name.required',
        'settlement.accountHolderName',
        'Account holder name is required',
      ),
    );
  } else if (!isValidName(accountHolderName)) {
    issues.push(
      fieldIssue(
        'settlement.holder_name.length',
        'settlement.accountHolderName',
        'Account holder name must be 2-100 characters',
      ),
    );
  }

  const compactAccountNumber = input.accountNumber.replace(/\s+/g, '');
  let accountNumberLast4 = '';
  if (compactAccountNumber === '') {
    issues.push(
      fieldIssue(
        'settlement.account_number.required',
        'settlement.accountNumber',
        'Account number is required',
      ),
    );
  } else if (!ACCOUNT_NUMBER_PATTERN.test(compactAccountNumber)) {
    issues.push(
      fieldIssue(
        'settlement.account_number.invalid',
        'settlement.accountNumber',
        'Account number must be 6-24 digits',
      ),
    );
  } else {
    accountNumberLast4 = compactAccountNumber.slice(-4);
  }

  const holderTypeId = input.holderTypeId.trim();
  const holderType = holderTypeId === '' ? undefined : findMerchantAccountHolderType(holderTypeId);
  if (holderTypeId === '') {
    issues.push(
      fieldIssue(
        'settlement.holder_type.required',
        'settlement.holderTypeId',
        'Account holder type is required',
      ),
    );
  } else if (!holderType) {
    issues.push(
      referenceDataIssue(
        'settlement.holder_type.unsupported',
        'settlement.holderTypeId',
        'Account holder type is not supported',
      ),
    );
  }

  let ownerRowId: string | null = input.ownerRowId;
  if (holderType?.requiresOwnerReference) {
    if (ownerRowId === null) {
      issues.push(
        fieldIssue(
          'settlement.owner.required',
          'settlement.ownerRowId',
          'Referenced owner is required for this holder type',
        ),
      );
    } else if (!owners.some((owner) => owner.ownerRowId === ownerRowId)) {
      issues.push(
        fieldIssue(
          'settlement.owner.unknown',
          'settlement.ownerRowId',
          'Referenced owner does not exist',
        ),
      );
    }
  } else if (ownerRowId !== null) {
    issues.push(
      fieldIssue(
        'settlement.owner.not_allowed',
        'settlement.ownerRowId',
        'Referenced owner is not allowed for this holder type',
      ),
    );
    ownerRowId = null;
  }

  const payoutScheduleId = input.payoutScheduleId.trim();
  const schedule =
    payoutScheduleId === '' ? undefined : findMerchantPayoutSchedule(payoutScheduleId);
  if (payoutScheduleId === '') {
    issues.push(
      fieldIssue(
        'settlement.schedule.required',
        'settlement.payoutScheduleId',
        'Payout schedule is required',
      ),
    );
  } else if (
    !schedule ||
    (bank !== undefined && !bank.supportedPayoutScheduleIds.includes(payoutScheduleId))
  ) {
    issues.push(
      referenceDataIssue(
        'settlement.schedule.unsupported',
        'settlement.payoutScheduleId',
        'Payout schedule is not supported for this bank',
      ),
    );
  }

  return {
    bankId,
    accountHolderName,
    accountNumberLast4,
    holderTypeId,
    ownerRowId,
    payoutScheduleId,
  };
}

function validateDeclarations(
  input: MerchantOnboardingApplicationInput['declarations'],
  issues: MerchantOnboardingPolicyIssue[],
): void {
  if (!input.informationAccurate) {
    issues.push(
      fieldIssue(
        'declarations.information_accurate.required',
        'declarations.informationAccurate',
        'The accuracy declaration must be accepted',
      ),
    );
  }
  if (!input.authorizedToSubmit) {
    issues.push(
      fieldIssue(
        'declarations.authorized_to_submit.required',
        'declarations.authorizedToSubmit',
        'The authorization declaration must be accepted',
      ),
    );
  }
  if (!input.termsAccepted) {
    issues.push(
      fieldIssue(
        'declarations.terms_accepted.required',
        'declarations.termsAccepted',
        'The terms declaration must be accepted',
      ),
    );
  }
  if (input.termsVersion !== MERCHANT_ONBOARDING_TERMS_VERSION) {
    issues.push(
      issue(
        'terms',
        'declarations.terms_version.stale',
        'declarations.termsVersion',
        'Terms version is no longer current',
      ),
    );
  }
}

export function validateMerchantOnboardingApplication(
  input: MerchantOnboardingApplicationInput,
): MerchantOnboardingPolicyOutcome {
  const issues: MerchantOnboardingPolicyIssue[] = [];

  const business = validateBusiness(input.business, issues);
  const owners = validateOwners(input.owners, issues);
  const settlement = validateSettlement(input.settlement, owners, issues);
  validateDeclarations(input.declarations, issues);

  if (issues.length > 0) {
    return { kind: 'invalid', issues };
  }

  return {
    kind: 'valid',
    application: {
      business,
      owners,
      settlement,
      termsVersion: input.declarations.termsVersion,
    },
  };
}
