# Account Deletion (30-day grace, email reusable)

This core kit implements **user-requested account deletion** as a **two-phase** workflow:

1. **Grace period (30 days)** — deletion is scheduled and can be canceled.
2. **Finalization** — the account is de-identified (PII erased) and becomes non-loginable.

This is preferred over hard-deleting the `User` row because it preserves referential integrity (FKs) and keeps audit history usable.

## API

### POST `/v1/me/account-deletion/request` → `204`

Schedules deletion 30 days in the future.

- Idempotent: repeated calls are safe.
- Uses Redis-backed idempotency if `Idempotency-Key` is provided.
- Blocked for the last active admin:
  - `409 USERS_CANNOT_DELETE_LAST_ADMIN`

### POST `/v1/me/account-deletion/cancel` → `204`

Cancels a previously scheduled deletion (idempotent).

## State fields (User)

- `deletionRequestedAt`
- `deletionScheduledFor`
- `deletedAt`
- `status`: `ACTIVE | SUSPENDED | DELETED`

## Worker finalization job

A BullMQ delayed job finalizes deletion after 30 days:

- Queue: `users`
- Job: `users.finalizeAccountDeletion`
- Job id: `users.finalizeAccountDeletion-{userId}` (so cancel/re-request works cleanly)

The job is idempotent:

- If the user does not exist, is already deleted, or deletion was canceled → job completes as “skipped”.
- If deletion is not yet due → job is moved back to delayed until `deletionScheduledFor`.
- If the user is the last active admin at finalize time → job is re-delayed for 24h and retried later.

## Finalization behavior (PII erasure)

When finalizing, the worker:

- Sets `status = DELETED`, `deletedAt = now`
- Clears pending deletion fields
- Scrubs the email to a unique placeholder: `deleted+{userId}@example.invalid`
  - This frees the original email so it can be reused by a future signup.
- Removes credentials and login vectors:
  - Deletes `PasswordCredential`
  - Deletes `ExternalIdentity`
  - Deletes verification/reset tokens
  - Deletes sessions (and cascades refresh tokens)
- Clears profile name fields

## Email notifications

When email is configured (`RESEND_API_KEY` + `EMAIL_FROM`), the API schedules two emails on the `emails` queue:

1. **Deletion requested** — sent immediately when the deletion is first requested.
2. **Reminder** — sent ~24 hours before `deletionScheduledFor`.

Notes:

- These emails are **best-effort**. Failures to enqueue should not block the API response.
- The email worker loads the user from the database at send-time and skips if deletion is canceled or already finalized.

## Email reuse (important invariant)

Email reuse is safe **only if** feature data ownership is keyed by `userId` (never by email).

Re-registering with the same email creates a new `userId` and does **not** inherit the deleted user’s data.
