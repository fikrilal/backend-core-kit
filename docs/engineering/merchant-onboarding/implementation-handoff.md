# Merchant Onboarding Backend Handoff

**Status:** implementation handoff  
**Target repository:** `/home/fikrilal/devs/core/backend-core-kit`  
**Target base branch:** `development`  
**Product scope:** educational four-step merchant application intake

This document translates the mobile validation blueprint into a small backend
capability. The originating artifact lives in the companion repository at
`mobile-core-kit/docs/explainers/features/merchant_onboarding/validation_architecture_blueprint.md`.
This is the backend behavior handoff, not an approved production banking or
compliance design.

## Recommendation

Add one authenticated `merchant-onboarding` feature with two endpoints:

```text
GET  /v1/merchant-onboarding/reference-data
POST /v1/merchant-onboarding/applications
```

The backend should own current catalog membership, business invariants,
uniqueness, idempotent creation, and persistence. It should not reproduce the
mobile wizard or trust mobile validation.

Use a compact capability slice under `libs/features/merchant-onboarding/`.
Keep its business policy framework-free and its Prisma access behind a
repository interface. Do not add a generic validation framework or catalog
administration system for this single case.

## Existing Backend Constraints

The receiving implementation must follow these backend sources of truth:

- `AGENTS.md`
- `docs/core/project-architecture.md`
- `docs/standards/api-response-standard.md`
- `docs/standards/error-codes.md`
- `docs/standards/reliability.md`
- `docs/standards/security.md`
- `docs/standards/testing-strategy.md`
- `docs/openapi/README.md`
- `docs/engineering/agent-pr-loop.md`
- `docs/engineering/parallel-agent-workflow.md`

Important existing behavior:

- APIs use the global `/v1` prefix.
- Success responses use `{ "data": ... }`.
- Errors use RFC 7807 problem details with stable `code` and `traceId`.
- Authenticated routes use `AccessTokenGuard` and `CurrentPrincipal`.
- Retriable writes use `Idempotent` and `ApiIdempotencyKeyHeader`.
- OpenAPI is code-first and generated to `docs/openapi/openapi.yaml`.
- Prisma mutations and multi-row invariants require runtime verification.

## Product Boundary

The backend accepts one application for the authenticated user. Submission is
the terminal behavior in this exercise: it does not start review, approval,
identity verification, payouts, jobs, notifications, or admin workflows.

The backend does not expose editable server drafts. The mobile app owns its
in-memory draft and sends one complete request.

## Reference Data

### Ownership

Reference options are code-owned constants in the merchant-onboarding feature
for v1. This avoids tables, seed migrations, admin CRUD, caching, and mutable
catalog lifecycle that the exercise does not need.

Each option has:

```text
id       stable machine identifier submitted by clients
label    display text for this educational implementation
metadata optional flags used by validation
```

IDs are contract values and must not be renamed casually. Labels are display
data and must not be stored as domain identity.

### Initial catalog

| Catalog          | IDs                                                                    | Validation metadata                     |
| ---------------- | ---------------------------------------------------------------------- | --------------------------------------- |
| business types   | `sole_proprietorship`, `private_company`                               | `requiresRegistrationNumber` false/true |
| industries       | `retail`, `food_beverage`, `professional_services`, `digital_services` | none                                    |
| monthly sales    | `under_10m_idr`, `10m_to_50m_idr`, `50m_to_250m_idr`, `above_250m_idr` | none                                    |
| owner roles      | `owner`, `director`                                                    | `contributesOwnership` true/false       |
| banks            | `demo_bank_alpha`, `demo_bank_beta`                                    | supported payout schedules              |
| holder types     | `business`, `owner`                                                    | `requiresOwnerReference` false/true     |
| payout schedules | `daily`, `weekly`                                                      | none                                    |

`demo_bank_alpha` supports `daily` and `weekly`;
`demo_bank_beta` supports `weekly` only. These are fictional values.

Use one explicit terms version such as `2026-08-30`. Changing catalogs or terms
is a reviewed contract change, not runtime administration.

## GET Reference Data

### Request

- Requires a valid access token.
- Has no query parameters.
- Does not require an idempotency key.

### Success

Return `200 OK`:

```json
{
  "data": {
    "businessTypes": [
      {
        "id": "private_company",
        "label": "Private company",
        "requiresRegistrationNumber": true
      }
    ],
    "industries": [{ "id": "retail", "label": "Retail" }],
    "monthlySalesRanges": [{ "id": "under_10m_idr", "label": "Under IDR 10 million" }],
    "ownerRoles": [{ "id": "owner", "label": "Owner", "contributesOwnership": true }],
    "banks": [
      {
        "id": "demo_bank_alpha",
        "label": "Demo Bank Alpha",
        "supportedPayoutScheduleIds": ["daily", "weekly"]
      }
    ],
    "accountHolderTypes": [
      {
        "id": "owner",
        "label": "Owner",
        "requiresOwnerReference": true
      }
    ],
    "payoutSchedules": [
      { "id": "daily", "label": "Daily" },
      { "id": "weekly", "label": "Weekly" }
    ],
    "termsVersion": "2026-08-30"
  }
}
```

The example is intentionally partial; the real response returns every initial
option listed above.

### Errors

- `401 UNAUTHORIZED`
- `500 INTERNAL`

## POST Application

### Request rules

- Requires a valid access token.
- Requires `Idempotency-Key`.
- One authenticated user can create at most one application.
- A replay with the same key and payload returns the stored response.
- Reusing the key for a different payload follows the existing platform
  `CONFLICT` behavior.

### Request body

```json
{
  "business": {
    "legalName": "Acme Studio",
    "businessTypeId": "private_company",
    "registrationNumber": "REG-12345",
    "industryId": "digital_services",
    "monthlySalesRangeId": "10m_to_50m_idr",
    "contactEmail": "owner@example.com",
    "contactPhone": "+6281234567890"
  },
  "owners": [
    {
      "ownerRowId": "a4591876-9c0c-4f8d-9df5-8fdd11ef13d8",
      "fullName": "Ari Example",
      "roleId": "owner",
      "ownershipBasisPoints": 10000,
      "email": "owner@example.com",
      "isPrimaryContact": true
    }
  ],
  "settlement": {
    "bankId": "demo_bank_alpha",
    "accountHolderName": "Ari Example",
    "accountNumber": "0012345678",
    "holderTypeId": "owner",
    "ownerRowId": "a4591876-9c0c-4f8d-9df5-8fdd11ef13d8",
    "payoutScheduleId": "weekly"
  },
  "declarations": {
    "informationAccurate": true,
    "authorizedToSubmit": true,
    "termsAccepted": true,
    "termsVersion": "2026-08-30"
  }
}
```

`ownershipBasisPoints` is an integer contract. The mobile domain converts
decimal percentages before mapping the request.

### Success

Return `201 Created`, a `Location` header, and:

```json
{
  "data": {
    "applicationId": "a7a6ce74-f9aa-48a5-b39d-fcb44d349f33",
    "submittedAt": "2026-08-30T10:00:00.000Z",
    "settlement": {
      "bankId": "demo_bank_alpha",
      "accountNumberLast4": "5678"
    }
  }
}
```

Never return the complete account number.

## Validation Ownership

### Transport validation

DTO/class-validator rules reject wrong JSON types, missing nested objects,
unknown properties, malformed UUIDs, invalid email syntax, and gross length
violations. These errors use `VALIDATION_FAILED`.

Transport paths for malformed owner rows may be index-based, for example
`owners.0.email`, because a usable `ownerRowId` may not exist yet.

### Business policy validation

A framework-free policy or service revalidates normalized values and owns:

| Input                    | Backend rule                                                               |
| ------------------------ | -------------------------------------------------------------------------- |
| legal name               | trim; 2–100 characters                                                     |
| business type            | ID exists in catalog                                                       |
| registration number      | required by type; uppercase; `^[A-Z0-9-]{4,30}$`                           |
| industry and sales range | IDs exist in catalogs                                                      |
| contact email            | trim and lowercase; valid syntax                                           |
| contact phone            | valid E.164, `^\+[1-9][0-9]{7,14}$`                                        |
| owners                   | 1–5 rows; unique row IDs                                                   |
| owner names              | trim; 2–100 characters                                                     |
| owner roles              | ID exists in catalog                                                       |
| ownership                | owning roles require 1–10,000 basis points; other roles require null       |
| owner aggregate          | at least one owner; total exactly 10,000; exactly one primary contact      |
| owner emails             | normalized values are unique                                               |
| bank and holder type     | IDs exist in catalogs                                                      |
| account number           | remove spaces; 6–24 ASCII digits; preserve leading zeroes while processing |
| settlement owner         | required and existing only when holder type requires it                    |
| payout schedule          | exists and is supported by the selected bank                               |
| declarations             | all three booleans are true; terms version is current                      |

Business failures should prefer stable row paths such as
`owners.<ownerRowId>.email`. Return all deterministic failures ordered by
request section, visible field order, then owner input order.

### Persistence validation

The repository transaction owns race-safe facts:

- only one application per `userId`;
- normalized registration number is unique when present; and
- the application and all owners are inserted atomically.

Do not rely on a pre-insert lookup alone. Back these rules with database unique
constraints and map Prisma conflicts to feature errors.

## Persistence Shape

Use the smallest relational model that supports this terminal submission.

### `MerchantApplication`

- `id` UUID primary key
- `userId` UUID, unique, relation to `User`
- normalized business fields and reference IDs
- normalized contact email and E.164 phone
- settlement bank, holder name/type, optional referenced owner-row ID, payout schedule
- `accountNumberLast4` only
- terms version and declaration acceptance timestamp
- `createdAt` and `updatedAt`

### `MerchantOwner`

- `id` UUID primary key
- `applicationId` relation with cascade delete
- `clientRowId` UUID, unique within the application
- normalized name, role ID, optional ownership basis points, normalized email,
  and primary-contact flag
- timestamps only if repository conventions require them

The settlement owner reference may be stored as `clientRowId` on the
application because it only identifies a row inside the immutable submission.
A database foreign key to `(applicationId, clientRowId)` is optional; the
transaction must validate the reference before insert either way.

Add the inverse Prisma relation on `User`. Generate one migration with a clear
merchant-onboarding name.

## Sensitive Settlement Data

For this educational implementation, the raw account number exists only long
enough to normalize, validate, and derive its last four digits. It must not be:

- written to Prisma;
- logged or included in tracing attributes;
- returned in a response or problem detail;
- placed in idempotency diagnostics beyond the platform's existing opaque
  request hash; or
- copied into tests as a real account value.

This means the feature does not provide a usable payout credential. A future
production settlement feature must add a reviewed provider-tokenization or
vault design; it must not expand this model to plaintext storage.

## Error Contract

Add feature codes to the repository's typed application error-code registry.

| HTTP | Code                                              | Optional field                    | Meaning                              |
| ---- | ------------------------------------------------- | --------------------------------- | ------------------------------------ |
| 400  | `VALIDATION_FAILED`                               | any input path                    | transport or business input invalid  |
| 401  | `UNAUTHORIZED`                                    | —                                 | access token absent/invalid          |
| 409  | `MERCHANT_ONBOARDING_APPLICATION_ALREADY_EXISTS`  | —                                 | user already submitted               |
| 409  | `MERCHANT_ONBOARDING_REGISTRATION_ALREADY_EXISTS` | `business.registrationNumber`     | registration already used            |
| 409  | `MERCHANT_ONBOARDING_REFERENCE_DATA_STALE`        | selected ID path                  | option disabled or unknown at submit |
| 409  | `MERCHANT_ONBOARDING_TERMS_VERSION_STALE`         | `declarations.termsVersion`       | terms version no longer current      |
| 409  | `IDEMPOTENCY_IN_PROGRESS`                         | —                                 | same request is still executing      |
| 409  | `CONFLICT`                                        | `Idempotency-Key` when applicable | key reused with a different payload  |
| 500  | `INTERNAL`                                        | —                                 | unexpected failure                   |

Use a feature error/filter following existing users/auth patterns. Do not throw
native Nest HTTP exceptions or raw production error-code strings.

Unknown internal errors must remain generic. Do not expose database constraint
names or submitted PII.

## Suggested Feature Files

Names can follow repository discoveries, but the expected ownership is:

```text
libs/features/merchant-onboarding/
  merchant-onboarding.module.ts
  merchant-onboarding.controller.ts
  merchant-onboarding.dto.ts
  merchant-onboarding.reference-data.ts
  merchant-onboarding.policy.ts
  merchant-onboarding.service.ts
  merchant-onboarding.repository.ts
  prisma-merchant-onboarding.repository.ts
  merchant-onboarding.errors.ts
  merchant-onboarding-error.filter.ts
  *.spec.ts
```

Also expect narrow changes to:

- `apps/api/src/app.module.ts`
- `libs/shared/app-error-codes.ts` and a typed merchant error-code file
- `prisma/schema.prisma` and one migration
- `docs/openapi/openapi.yaml`
- targeted integration/e2e tests
- the backend engineering index if a permanent feature note is added

Do not add a worker, queue, Redis cache, external bank adapter, feature flag, or
environment variable.

## Test Contract

### Unit

- every catalog membership and conditional registration branch;
- owner count, unique row IDs/emails, exact ownership total, and primary contact;
- settlement owner relationship and bank/schedule compatibility;
- declaration and terms validation;
- deterministic error order and paths;
- raw account number absent from returned/persistable application data.

### Repository/integration

- application plus owners commit atomically;
- user and registration unique constraints are mapped correctly;
- rollback leaves no partial rows;
- stored data contains last four digits but not the raw account number.

### HTTP/e2e

- authenticated reference-data response matches OpenAPI;
- valid submission returns `201`, envelope, `Location`, and safe response;
- invalid nested fields return RFC 7807 errors with usable paths;
- unauthenticated calls return `UNAUTHORIZED`;
- duplicate application and registration return stable feature codes;
- identical idempotent replay does not insert twice and returns
  `Idempotency-Replayed: true`;
- same key with changed payload returns the platform conflict;
- no response or captured log contains the submitted account number.

## Acceptance Criteria

1. Both endpoints are authenticated, documented, and conform to backend
   envelope/problem standards.
2. The backend rejects every locally documented invalid state independently of
   the client.
3. Catalog IDs and conditional metadata match this handoff.
4. One transaction creates one application and its one-to-five owners.
5. Unique constraints make duplicate user/registration behavior race-safe.
6. The submit route requires and correctly replays an idempotency key.
7. Raw bank account numbers are not persisted, returned, or logged.
8. OpenAPI, unit, integration, e2e, dependency, and Prisma gates pass.

## Explicit Non-Goals

- merchant approval/status endpoints;
- application editing or server drafts;
- admin catalog management;
- document or image uploads;
- country/city/address data;
- actual bank verification or payout execution;
- encryption/token vault infrastructure;
- queues, notifications, webhooks, or background processing; and
- mobile code changes.

Any requirement above needs a separate architecture decision and execution
plan. It should not be smuggled into the first implementation as “future
flexibility.”
