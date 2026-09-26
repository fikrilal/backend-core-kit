import type {
  MerchantOnboardingApplicationInput,
  MerchantOnboardingOwnerInput,
  MerchantOnboardingPolicyIssue,
} from './merchant-onboarding.model';
import type { MerchantOnboardingPolicyOutcome } from './merchant-onboarding.policy';
import { validateMerchantOnboardingApplication } from './merchant-onboarding.policy';

const OWNER_ROW_ID_A = '11111111-1111-4111-8111-111111111111';
const OWNER_ROW_ID_B = '22222222-2222-4222-8222-222222222222';

function buildOwnerInput(
  overrides: Partial<MerchantOnboardingOwnerInput> = {},
): MerchantOnboardingOwnerInput {
  return {
    ownerRowId: OWNER_ROW_ID_A,
    fullName: 'Ari Example',
    roleId: 'owner',
    ownershipBasisPoints: 10000,
    email: 'owner@example.com',
    isPrimaryContact: true,
    ...overrides,
  };
}

function buildValidInput(
  overrides: Partial<MerchantOnboardingApplicationInput> = {},
): MerchantOnboardingApplicationInput {
  return {
    business: {
      legalName: 'Acme Studio',
      businessTypeId: 'private_company',
      registrationNumber: 'REG-12345',
      industryId: 'digital_services',
      monthlySalesRangeId: '10m_to_50m_idr',
      contactEmail: 'owner@example.com',
      contactPhone: '+6281234567890',
    },
    owners: [buildOwnerInput()],
    settlement: {
      bankId: 'demo_bank_alpha',
      accountHolderName: 'Ari Example',
      accountNumber: '0012345678',
      holderTypeId: 'owner',
      ownerRowId: OWNER_ROW_ID_A,
      payoutScheduleId: 'weekly',
    },
    declarations: {
      informationAccurate: true,
      authorizedToSubmit: true,
      termsAccepted: true,
      termsVersion: '2026-08-30',
    },
    ...overrides,
  };
}

function issueCodes(outcome: MerchantOnboardingPolicyOutcome): string[] {
  if (outcome.kind === 'valid') return [];
  return outcome.issues.map((issue) => issue.code);
}

function issuesFor(
  outcome: MerchantOnboardingPolicyOutcome,
  code: string,
): ReadonlyArray<MerchantOnboardingPolicyIssue> {
  if (outcome.kind !== 'invalid') {
    throw new Error(`Expected invalid outcome for code ${code}`);
  }
  return outcome.issues.filter((issue) => issue.code === code);
}

function requireInvalid(outcome: MerchantOnboardingPolicyOutcome): {
  issues: ReadonlyArray<MerchantOnboardingPolicyIssue>;
} {
  if (outcome.kind !== 'invalid') {
    throw new Error('Expected invalid outcome');
  }
  return { issues: outcome.issues };
}

describe('validateMerchantOnboardingApplication', () => {
  describe('valid applications', () => {
    it('accepts the handoff example and returns normalized values', () => {
      const outcome = validateMerchantOnboardingApplication(buildValidInput());

      if (outcome.kind !== 'valid') {
        throw new Error(`Expected valid outcome, got: ${issueCodes(outcome).join(', ')}`);
      }

      expect(outcome.application.business).toEqual({
        legalName: 'Acme Studio',
        businessTypeId: 'private_company',
        registrationNumber: 'REG-12345',
        industryId: 'digital_services',
        monthlySalesRangeId: '10m_to_50m_idr',
        contactEmail: 'owner@example.com',
        contactPhone: '+6281234567890',
      });
      expect(outcome.application.settlement).toEqual({
        bankId: 'demo_bank_alpha',
        accountHolderName: 'Ari Example',
        accountNumberLast4: '5678',
        holderTypeId: 'owner',
        ownerRowId: OWNER_ROW_ID_A,
        payoutScheduleId: 'weekly',
      });
      expect(outcome.application.termsVersion).toBe('2026-08-30');
    });

    it('normalizes emails, names, and registration numbers', () => {
      const outcome = validateMerchantOnboardingApplication(
        buildValidInput({
          business: {
            legalName: '  Acme Studio  ',
            businessTypeId: 'private_company',
            registrationNumber: 'reg-12345',
            industryId: 'digital_services',
            monthlySalesRangeId: '10m_to_50m_idr',
            contactEmail: '  Owner@Example.COM  ',
            contactPhone: ' +6281234567890 ',
          },
        }),
      );

      if (outcome.kind !== 'valid') {
        throw new Error(`Expected valid outcome, got: ${issueCodes(outcome).join(', ')}`);
      }

      expect(outcome.application.business.legalName).toBe('Acme Studio');
      expect(outcome.application.business.registrationNumber).toBe('REG-12345');
      expect(outcome.application.business.contactEmail).toBe('owner@example.com');
      expect(outcome.application.business.contactPhone).toBe('+6281234567890');
      expect(outcome.application.owners[0]?.email).toBe('owner@example.com');
    });

    it('allows a missing registration number for types that do not require one', () => {
      const outcome = validateMerchantOnboardingApplication(
        buildValidInput({
          business: {
            legalName: 'Acme Studio',
            businessTypeId: 'sole_proprietorship',
            registrationNumber: null,
            industryId: 'retail',
            monthlySalesRangeId: 'under_10m_idr',
            contactEmail: 'owner@example.com',
            contactPhone: '+6281234567890',
          },
        }),
      );

      if (outcome.kind !== 'valid') {
        throw new Error(`Expected valid outcome, got: ${issueCodes(outcome).join(', ')}`);
      }
      expect(outcome.application.business.registrationNumber).toBeNull();
    });

    it('validates and preserves an optional registration number when supplied', () => {
      const outcome = validateMerchantOnboardingApplication(
        buildValidInput({
          business: {
            legalName: 'Acme Studio',
            businessTypeId: 'sole_proprietorship',
            registrationNumber: ' reg-9 ',
            industryId: 'retail',
            monthlySalesRangeId: 'under_10m_idr',
            contactEmail: 'owner@example.com',
            contactPhone: '+6281234567890',
          },
        }),
      );

      if (outcome.kind !== 'valid') {
        throw new Error(`Expected valid outcome, got: ${issueCodes(outcome).join(', ')}`);
      }
      expect(outcome.application.business.registrationNumber).toBe('REG-9');
    });

    it('removes spaces from the account number and preserves leading zeroes for last four', () => {
      const outcome = validateMerchantOnboardingApplication(
        buildValidInput({
          settlement: {
            bankId: 'demo_bank_alpha',
            accountHolderName: 'Ari Example',
            accountNumber: '0012 3456 7890',
            holderTypeId: 'owner',
            ownerRowId: OWNER_ROW_ID_A,
            payoutScheduleId: 'weekly',
          },
        }),
      );

      if (outcome.kind !== 'valid') {
        throw new Error(`Expected valid outcome, got: ${issueCodes(outcome).join(', ')}`);
      }
      expect(outcome.application.settlement.accountNumberLast4).toBe('7890');
    });

    it('accepts multiple owners with exact totals and one primary contact', () => {
      const outcome = validateMerchantOnboardingApplication(
        buildValidInput({
          owners: [
            buildOwnerInput({
              ownerRowId: OWNER_ROW_ID_A,
              email: 'ari@example.com',
              ownershipBasisPoints: 6000,
              isPrimaryContact: true,
            }),
            buildOwnerInput({
              ownerRowId: OWNER_ROW_ID_B,
              fullName: 'Bella Example',
              email: 'bella@example.com',
              ownershipBasisPoints: 4000,
              isPrimaryContact: false,
            }),
          ],
          settlement: {
            bankId: 'demo_bank_alpha',
            accountHolderName: 'Ari Example',
            accountNumber: '0012345678',
            holderTypeId: 'owner',
            ownerRowId: OWNER_ROW_ID_A,
            payoutScheduleId: 'weekly',
          },
        }),
      );

      if (outcome.kind !== 'valid') {
        throw new Error(`Expected valid outcome, got: ${issueCodes(outcome).join(', ')}`);
      }
      expect(outcome.application.owners).toHaveLength(2);
    });
  });

  describe('business profile rules', () => {
    it('rejects a blank or out-of-range legal name', () => {
      const blank = requireInvalid(
        validateMerchantOnboardingApplication(
          buildValidInput({
            business: { ...buildValidInput().business, legalName: '   ' },
          }),
        ),
      );
      expect(issueCodes({ kind: 'invalid', issues: blank.issues })).toContain(
        'business.legal_name.required',
      );

      const tooShort = requireInvalid(
        validateMerchantOnboardingApplication(
          buildValidInput({
            business: { ...buildValidInput().business, legalName: ' a ' },
          }),
        ),
      );
      expect(issueCodes({ kind: 'invalid', issues: tooShort.issues })).toContain(
        'business.legal_name.length',
      );

      const tooLong = requireInvalid(
        validateMerchantOnboardingApplication(
          buildValidInput({
            business: { ...buildValidInput().business, legalName: 'x'.repeat(101) },
          }),
        ),
      );
      expect(issueCodes({ kind: 'invalid', issues: tooLong.issues })).toContain(
        'business.legal_name.length',
      );
    });

    it('rejects a missing or unsupported business type', () => {
      const missing = requireInvalid(
        validateMerchantOnboardingApplication(
          buildValidInput({
            business: { ...buildValidInput().business, businessTypeId: '' },
          }),
        ),
      );
      expect(issueCodes({ kind: 'invalid', issues: missing.issues })).toEqual(
        expect.arrayContaining(['business.type.required']),
      );

      const unsupported = requireInvalid(
        validateMerchantOnboardingApplication(
          buildValidInput({
            business: { ...buildValidInput().business, businessTypeId: 'unknown_type' },
          }),
        ),
      );
      const issue = issuesFor(
        { kind: 'invalid', issues: unsupported.issues },
        'business.type.unsupported',
      )[0];
      expect(issue?.category).toBe('reference_data');
      expect(issue?.path).toBe('business.businessTypeId');
    });

    it('requires a registration number only for types that need one', () => {
      const missing = requireInvalid(
        validateMerchantOnboardingApplication(
          buildValidInput({
            business: { ...buildValidInput().business, registrationNumber: null },
          }),
        ),
      );
      const required = issuesFor(
        { kind: 'invalid', issues: missing.issues },
        'business.registration.required',
      )[0];
      expect(required?.path).toBe('business.registrationNumber');

      const notRequired = validateMerchantOnboardingApplication(
        buildValidInput({
          business: {
            legalName: 'Acme Studio',
            businessTypeId: 'sole_proprietorship',
            registrationNumber: null,
            industryId: 'retail',
            monthlySalesRangeId: 'under_10m_idr',
            contactEmail: 'owner@example.com',
            contactPhone: '+6281234567890',
          },
        }),
      );
      expect(notRequired.kind).toBe('valid');
    });

    it('rejects registration numbers with invalid format', () => {
      for (const raw of ['abc', 'REG_1', 'REG 1', 'A'.repeat(31)]) {
        const outcome = requireInvalid(
          validateMerchantOnboardingApplication(
            buildValidInput({
              business: { ...buildValidInput().business, registrationNumber: raw },
            }),
          ),
        );
        expect(issueCodes({ kind: 'invalid', issues: outcome.issues })).toContain(
          'business.registration.invalid',
        );
      }
    });

    it('rejects missing or unsupported industry and sales range', () => {
      const outcome = requireInvalid(
        validateMerchantOnboardingApplication(
          buildValidInput({
            business: {
              ...buildValidInput().business,
              industryId: '',
              monthlySalesRangeId: 'unknown_range',
            },
          }),
        ),
      );
      expect(issueCodes({ kind: 'invalid', issues: outcome.issues })).toEqual(
        expect.arrayContaining(['business.industry.required', 'business.sales_range.unsupported']),
      );
    });

    it('rejects invalid contact email and phone', () => {
      const outcome = requireInvalid(
        validateMerchantOnboardingApplication(
          buildValidInput({
            business: {
              ...buildValidInput().business,
              contactEmail: 'not-an-email',
              contactPhone: '62812345678',
            },
          }),
        ),
      );
      expect(issueCodes({ kind: 'invalid', issues: outcome.issues })).toEqual(
        expect.arrayContaining(['contact.email.invalid', 'contact.phone.invalid']),
      );

      const missing = requireInvalid(
        validateMerchantOnboardingApplication(
          buildValidInput({
            business: { ...buildValidInput().business, contactEmail: '', contactPhone: '' },
          }),
        ),
      );
      expect(issueCodes({ kind: 'invalid', issues: missing.issues })).toEqual(
        expect.arrayContaining(['contact.email.required', 'contact.phone.required']),
      );
    });
  });

  describe('owner rules', () => {
    it('requires at least one owner and reports aggregate issues deterministically', () => {
      const outcome = requireInvalid(
        validateMerchantOnboardingApplication(buildValidInput({ owners: [] })),
      );
      expect(issueCodes({ kind: 'invalid', issues: outcome.issues })).toEqual([
        'owners.required',
        'owners.primary.invalid',
        'owners.total.invalid',
        'settlement.owner.unknown',
      ]);
    });

    it('rejects more than five owners', () => {
      const sixOwners = [1, 2, 3, 4, 5, 6].map((index) =>
        buildOwnerInput({
          ownerRowId: `${index}1111111-1111-4111-8111-111111111111`,
          email: `owner${index}@example.com`,
          ownershipBasisPoints: index === 1 ? 9995 : 1,
          isPrimaryContact: index === 1,
        }),
      );

      const outcome = requireInvalid(
        validateMerchantOnboardingApplication(buildValidInput({ owners: sixOwners })),
      );
      expect(issueCodes({ kind: 'invalid', issues: outcome.issues })).toContain(
        'owners.limit.exceeded',
      );
    });

    it('rejects duplicate owner row IDs and attributes the issue to the later row', () => {
      const outcome = requireInvalid(
        validateMerchantOnboardingApplication(
          buildValidInput({
            owners: [
              buildOwnerInput({ ownerRowId: OWNER_ROW_ID_A }),
              buildOwnerInput({ ownerRowId: OWNER_ROW_ID_A }),
            ],
          }),
        ),
      );
      const duplicates = issuesFor(
        { kind: 'invalid', issues: outcome.issues },
        'owners.row_id.duplicate',
      );
      expect(duplicates).toHaveLength(1);
      expect(duplicates[0]?.path).toBe(`owners.${OWNER_ROW_ID_A}.ownerRowId`);
    });

    it('rejects invalid owner names, roles, and emails per row', () => {
      const outcome = requireInvalid(
        validateMerchantOnboardingApplication(
          buildValidInput({
            owners: [
              buildOwnerInput({
                fullName: '',
                roleId: 'unknown_role',
                email: 'not-an-email',
              }),
            ],
          }),
        ),
      );
      expect(issueCodes({ kind: 'invalid', issues: outcome.issues })).toEqual(
        expect.arrayContaining([
          'owner.name.required',
          'owner.role.unsupported',
          'owner.email.invalid',
          'owners.total.invalid',
        ]),
      );
      const roleIssue = issuesFor(
        { kind: 'invalid', issues: outcome.issues },
        'owner.role.unsupported',
      )[0];
      expect(roleIssue?.category).toBe('reference_data');
      expect(roleIssue?.path).toBe(`owners.${OWNER_ROW_ID_A}.roleId`);
    });

    it('enforces conditional ownership percentages', () => {
      const missingPercentage = requireInvalid(
        validateMerchantOnboardingApplication(
          buildValidInput({
            owners: [buildOwnerInput({ ownershipBasisPoints: null })],
          }),
        ),
      );
      expect(issueCodes({ kind: 'invalid', issues: missingPercentage.issues })).toContain(
        'owner.percentage.required',
      );

      const outOfRange = requireInvalid(
        validateMerchantOnboardingApplication(
          buildValidInput({
            owners: [buildOwnerInput({ ownershipBasisPoints: 10001 })],
          }),
        ),
      );
      expect(issueCodes({ kind: 'invalid', issues: outOfRange.issues })).toContain(
        'owner.percentage.invalid',
      );

      const notAllowed = requireInvalid(
        validateMerchantOnboardingApplication(
          buildValidInput({
            owners: [buildOwnerInput({ roleId: 'director', ownershipBasisPoints: 100 })],
          }),
        ),
      );
      expect(issueCodes({ kind: 'invalid', issues: notAllowed.issues })).toContain(
        'owner.percentage.not_allowed',
      );
      const percentageIssue = issuesFor(
        { kind: 'invalid', issues: notAllowed.issues },
        'owner.percentage.not_allowed',
      )[0];
      expect(percentageIssue?.path).toBe(`owners.${OWNER_ROW_ID_A}.ownershipBasisPoints`);
    });

    it('rejects duplicate normalized owner emails and attributes them to the later row', () => {
      const outcome = requireInvalid(
        validateMerchantOnboardingApplication(
          buildValidInput({
            owners: [
              buildOwnerInput({
                ownerRowId: OWNER_ROW_ID_A,
                email: 'Ari@Example.com',
                ownershipBasisPoints: 6000,
              }),
              buildOwnerInput({
                ownerRowId: OWNER_ROW_ID_B,
                fullName: 'Bella Example',
                email: '  ari@example.com  ',
                ownershipBasisPoints: 4000,
                isPrimaryContact: false,
              }),
            ],
          }),
        ),
      );
      const duplicates = issuesFor(
        { kind: 'invalid', issues: outcome.issues },
        'owners.email.duplicate',
      );
      expect(duplicates).toHaveLength(1);
      expect(duplicates[0]?.path).toBe(`owners.${OWNER_ROW_ID_B}.email`);
    });

    it('requires exactly one primary contact', () => {
      const zeroPrimary = requireInvalid(
        validateMerchantOnboardingApplication(
          buildValidInput({
            owners: [buildOwnerInput({ isPrimaryContact: false })],
          }),
        ),
      );
      expect(issueCodes({ kind: 'invalid', issues: zeroPrimary.issues })).toContain(
        'owners.primary.invalid',
      );

      const twoPrimary = requireInvalid(
        validateMerchantOnboardingApplication(
          buildValidInput({
            owners: [
              buildOwnerInput({
                ownerRowId: OWNER_ROW_ID_A,
                ownershipBasisPoints: 6000,
                isPrimaryContact: true,
              }),
              buildOwnerInput({
                ownerRowId: OWNER_ROW_ID_B,
                fullName: 'Bella Example',
                email: 'bella@example.com',
                ownershipBasisPoints: 4000,
                isPrimaryContact: true,
              }),
            ],
          }),
        ),
      );
      expect(issueCodes({ kind: 'invalid', issues: twoPrimary.issues })).toContain(
        'owners.primary.invalid',
      );
    });

    it('requires ownership to total exactly 10000 basis points', () => {
      const under = requireInvalid(
        validateMerchantOnboardingApplication(
          buildValidInput({
            owners: [
              buildOwnerInput({
                ownerRowId: OWNER_ROW_ID_A,
                ownershipBasisPoints: 9999,
              }),
            ],
          }),
        ),
      );
      expect(issueCodes({ kind: 'invalid', issues: under.issues })).toContain(
        'owners.total.invalid',
      );

      const over = requireInvalid(
        validateMerchantOnboardingApplication(
          buildValidInput({
            owners: [
              buildOwnerInput({
                ownerRowId: OWNER_ROW_ID_A,
                ownershipBasisPoints: 9999,
              }),
              buildOwnerInput({
                ownerRowId: OWNER_ROW_ID_B,
                fullName: 'Bella Example',
                email: 'bella@example.com',
                ownershipBasisPoints: 2,
                isPrimaryContact: false,
              }),
            ],
          }),
        ),
      );
      expect(issueCodes({ kind: 'invalid', issues: over.issues })).toContain(
        'owners.total.invalid',
      );
    });
  });

  describe('settlement rules', () => {
    it('rejects a missing or unsupported bank', () => {
      const missing = requireInvalid(
        validateMerchantOnboardingApplication(
          buildValidInput({
            settlement: { ...buildValidInput().settlement, bankId: '' },
          }),
        ),
      );
      expect(issueCodes({ kind: 'invalid', issues: missing.issues })).toEqual(
        expect.arrayContaining(['settlement.bank.required']),
      );

      const unsupported = requireInvalid(
        validateMerchantOnboardingApplication(
          buildValidInput({
            settlement: { ...buildValidInput().settlement, bankId: 'unknown_bank' },
          }),
        ),
      );
      const issue = issuesFor(
        { kind: 'invalid', issues: unsupported.issues },
        'settlement.bank.unsupported',
      )[0];
      expect(issue?.category).toBe('reference_data');
    });

    it('rejects invalid account holder names and account numbers', () => {
      const outcome = requireInvalid(
        validateMerchantOnboardingApplication(
          buildValidInput({
            settlement: {
              ...buildValidInput().settlement,
              accountHolderName: '',
              accountNumber: '12345',
            },
          }),
        ),
      );
      expect(issueCodes({ kind: 'invalid', issues: outcome.issues })).toEqual(
        expect.arrayContaining([
          'settlement.holder_name.required',
          'settlement.account_number.invalid',
        ]),
      );

      const missingAccount = requireInvalid(
        validateMerchantOnboardingApplication(
          buildValidInput({
            settlement: { ...buildValidInput().settlement, accountNumber: '' },
          }),
        ),
      );
      expect(issueCodes({ kind: 'invalid', issues: missingAccount.issues })).toContain(
        'settlement.account_number.required',
      );

      const tooLong = requireInvalid(
        validateMerchantOnboardingApplication(
          buildValidInput({
            settlement: {
              ...buildValidInput().settlement,
              accountNumber: '1'.repeat(25),
            },
          }),
        ),
      );
      expect(issueCodes({ kind: 'invalid', issues: tooLong.issues })).toContain(
        'settlement.account_number.invalid',
      );

      const nonDigit = requireInvalid(
        validateMerchantOnboardingApplication(
          buildValidInput({
            settlement: {
              ...buildValidInput().settlement,
              accountNumber: '1234-678',
            },
          }),
        ),
      );
      expect(issueCodes({ kind: 'invalid', issues: nonDigit.issues })).toContain(
        'settlement.account_number.invalid',
      );
    });

    it('enforces the settlement owner relationship', () => {
      const notAllowed = requireInvalid(
        validateMerchantOnboardingApplication(
          buildValidInput({
            settlement: {
              ...buildValidInput().settlement,
              holderTypeId: 'business',
              ownerRowId: OWNER_ROW_ID_A,
            },
          }),
        ),
      );
      expect(issueCodes({ kind: 'invalid', issues: notAllowed.issues })).toEqual(
        expect.arrayContaining(['settlement.owner.not_allowed']),
      );

      const missing = requireInvalid(
        validateMerchantOnboardingApplication(
          buildValidInput({
            settlement: {
              ...buildValidInput().settlement,
              holderTypeId: 'owner',
              ownerRowId: null,
            },
          }),
        ),
      );
      expect(issueCodes({ kind: 'invalid', issues: missing.issues })).toEqual(
        expect.arrayContaining(['settlement.owner.required']),
      );

      const unknown = requireInvalid(
        validateMerchantOnboardingApplication(
          buildValidInput({
            settlement: {
              ...buildValidInput().settlement,
              holderTypeId: 'owner',
              ownerRowId: '99999999-9999-4999-8999-999999999999',
            },
          }),
        ),
      );
      const issue = issuesFor(
        { kind: 'invalid', issues: unknown.issues },
        'settlement.owner.unknown',
      )[0];
      expect(issue?.path).toBe('settlement.ownerRowId');
    });

    it('rejects payout schedules the bank does not support', () => {
      const bankMismatch = requireInvalid(
        validateMerchantOnboardingApplication(
          buildValidInput({
            settlement: {
              ...buildValidInput().settlement,
              bankId: 'demo_bank_beta',
              payoutScheduleId: 'daily',
            },
          }),
        ),
      );
      const issue = issuesFor(
        { kind: 'invalid', issues: bankMismatch.issues },
        'settlement.schedule.unsupported',
      )[0];
      expect(issue?.category).toBe('reference_data');
      expect(issue?.path).toBe('settlement.payoutScheduleId');

      const unknownSchedule = requireInvalid(
        validateMerchantOnboardingApplication(
          buildValidInput({
            settlement: {
              ...buildValidInput().settlement,
              payoutScheduleId: 'monthly',
            },
          }),
        ),
      );
      expect(issueCodes({ kind: 'invalid', issues: unknownSchedule.issues })).toEqual(
        expect.arrayContaining(['settlement.schedule.unsupported']),
      );
    });
  });

  describe('declarations rules', () => {
    it('requires all three declarations to be true', () => {
      const outcome = requireInvalid(
        validateMerchantOnboardingApplication(
          buildValidInput({
            declarations: {
              informationAccurate: false,
              authorizedToSubmit: true,
              termsAccepted: false,
              termsVersion: '2026-08-30',
            },
          }),
        ),
      );
      expect(issueCodes({ kind: 'invalid', issues: outcome.issues })).toEqual(
        expect.arrayContaining([
          'declarations.information_accurate.required',
          'declarations.terms_accepted.required',
        ]),
      );
    });

    it('flags a stale terms version in the terms category', () => {
      const outcome = requireInvalid(
        validateMerchantOnboardingApplication(
          buildValidInput({
            declarations: {
              informationAccurate: true,
              authorizedToSubmit: true,
              termsAccepted: true,
              termsVersion: '2026-07-01',
            },
          }),
        ),
      );
      const issue = issuesFor(
        { kind: 'invalid', issues: outcome.issues },
        'declarations.terms_version.stale',
      )[0];
      expect(issue?.category).toBe('terms');
      expect(issue?.path).toBe('declarations.termsVersion');
    });
  });

  describe('deterministic order and sensitive data', () => {
    it('orders issues by section, field order, then owner row order', () => {
      const outcome = requireInvalid(
        validateMerchantOnboardingApplication(
          buildValidInput({
            business: { ...buildValidInput().business, legalName: '' },
            owners: [
              buildOwnerInput({ fullName: '' }),
              buildOwnerInput({
                ownerRowId: OWNER_ROW_ID_B,
                fullName: 'Bella Example',
                email: 'bella@example.com',
                ownershipBasisPoints: 4000,
                isPrimaryContact: false,
                roleId: '',
              }),
            ],
            settlement: { ...buildValidInput().settlement, bankId: '' },
            declarations: { ...buildValidInput().declarations, informationAccurate: false },
          }),
        ),
      );

      expect(issueCodes({ kind: 'invalid', issues: outcome.issues })).toEqual([
        'business.legal_name.required',
        'owner.name.required',
        'owner.role.required',
        'owner.percentage.not_allowed',
        'settlement.bank.required',
        'declarations.information_accurate.required',
      ]);
    });

    it('never exposes the raw account number in the validated application or issues', () => {
      const valid = validateMerchantOnboardingApplication(buildValidInput());
      expect(JSON.stringify(valid)).not.toContain('0012345678');

      const invalid = validateMerchantOnboardingApplication(
        buildValidInput({
          settlement: {
            ...buildValidInput().settlement,
            accountNumber: '999000111222333444555666777',
          },
        }),
      );
      expect(JSON.stringify(invalid)).not.toContain('999000111222333444555666777');
    });
  });
});
