# Engineering Proposal: Push Notifications (FCM, optional scaffold)

This proposal adds a production-grade **push notification scaffold** to the core kit, targeting **Firebase Cloud Messaging (FCM)** first.

The intent is: provide a clean, reusable baseline that most products need, while keeping it **disabled-by-default** unless configured.

## Delivery plan (phased)

### Phase 1 — Infra (implemented)

- Platform push port + FCM adapter using `firebase-admin` (no endpoints yet):
  - `libs/platform/push/*`
- Push queue + worker processor (no DB integration yet):
  - `apps/worker/src/jobs/push.worker.ts`
- Env validation for push config:
  - `libs/platform/config/env.validation.ts`
- Unit tests for the FCM adapter:
  - `libs/platform/push/fcm-push.service.spec.ts`

### Phase 2 — Token registration + delivery integration (not implemented)

- Persist push token(s) against the current session/device.
- Add user self-service endpoints to register/revoke tokens.
- Add application-level use cases that enqueue `push.send` jobs.

## Goals

- Provide a **standard way** for clients (Android/iOS/Web) to register push tokens to the backend.
- Provide a **worker-driven delivery path** (BullMQ) for reliability, retries, and observability.
- Keep push infra **optional** (no hard dependency for adopters who don’t ship mobile).
- Align with enterprise safety:
  - no token logging
  - revocation-aware delivery (don’t send to revoked sessions)
  - stable error codes + predictable behavior

## Non-goals (v1)

- “Notification feed” (in-app inbox) + read/unread state.
- Per-user notification preferences / categories.
- Multi-provider routing (OneSignal, Expo, SNS, etc.) beyond a clean port.
- Topic/subscription management.
- Image/media payload hosting.

## High-level architecture (recommended)

1. Client obtains an FCM registration token.
2. Client registers token to the backend, scoped to the **current session**.
3. Application code enqueues push deliveries (never sends inline).
4. Worker dequeues jobs and calls the FCM provider.
5. Worker handles provider errors, and marks invalid tokens as revoked.

### Why session-scoped tokens?

- Push tokens are “device/app install” identifiers. In a core kit, the safest default is:
  - tokens belong to a **session** (so revoking the session revokes push delivery)
  - you can revoke other sessions and their tokens as part of security workflows

## Data model (recommended)

Store push tokens on `Session` (simple, minimal moving parts, aligns with session revocation).

### Schema changes (proposal)

Add:

- `enum PushPlatform { ANDROID IOS WEB }`

Add to `Session`:

- `pushPlatform PushPlatform?`
- `pushToken String? @db.VarChar(512)`
- `pushTokenUpdatedAt DateTime?`
- `pushTokenRevokedAt DateTime?`

Constraints / indexes:

- `@@index([userId])` already exists
- `@@index([revokedAt])` already exists
- Optional uniqueness:
  - **Option A (recommended):** no DB `@unique` on `pushToken` (avoid edge cases where the same token re-registers under a new session while the old session record still exists).
  - Enforce “one active token per session” at app level.

Revocation integration:

- When a session is revoked, clear token fields (or set `pushTokenRevokedAt` and null out `pushToken`) so the same device can register again cleanly.

### Alternative model (if we need more flexibility)

Create `SessionPushDevice` table:

- allows multiple tokens per session
- allows token rotation history
- more queries + more code

I recommend starting with `Session` fields unless/until we have a real requirement for multiple tokens per session.

## API surface (always present, but disabled unless configured)

All endpoints require `Authorization: Bearer <access token>`.

### 1) Register / upsert push token

`PUT /v1/me/push-token`

Body:

```json
{ "platform": "ANDROID", "token": "..." }
```

Behavior:

- Validates token length and platform.
- Saves token **against the current session** (`principal.sessionId`).
- If a different token was already present on the session, replace it (token rotation).
- Updates `pushTokenUpdatedAt`.
- Returns `204 No Content`.

Errors:

- `401 UNAUTHORIZED`
- `400 VALIDATION_FAILED`
- `501 PUSH_NOT_CONFIGURED` (when provider config is missing)

### 2) Revoke push token (current session)

`DELETE /v1/me/push-token`

Behavior:

- Clears the token fields for the current session (idempotent).
- Returns `204 No Content`.

Errors:

- `401 UNAUTHORIZED`

## Push delivery (BullMQ worker)

### Queue

Create a new queue: `push`

Rationale: keep `emails` and `users` queues focused; push sends often have different retry/error handling.

### Job: `push.send`

Data:

- **Phase 1 (implemented):**
  - `token: string`
  - `notification?: { title?: string; body?: string }`
  - `data?: Record<string, string>` (FCM “data messages” payload; values must be strings)
  - `requestedAt: ISO datetime`
- **Phase 2 (recommended):** switch the job payload to `sessionId` (and resolve token in worker) so revocations are enforced consistently.

Worker behavior:

1. Send to token via provider.
2. If provider returns “token unregistered/invalid”, treat as success (skip + no retries).
3. (Phase 2) When token is stored in DB, revoke/clear the token fields on invalid token errors.

Retries:

- Use default queue retry policy (exponential backoff).
- Do not retry on “unregistered token” type errors.

Observability:

- rely on existing queue trace propagation (HTTP → enqueue → worker).
- include `traceId` when enqueueing push send jobs for auditability.

## Provider implementation (FCM HTTP v1)

### Port (platform)

Add `libs/platform/push/`:

- `PushService` interface:
  - `isEnabled(): boolean`
  - `sendToToken(input): Promise<PushSendResult>`

### Adapter (FCM)

Phase 1 uses the official **Firebase Admin SDK** (`firebase-admin`) to send messages:

- `firebase-admin/app` for initialization (service account JSON or ADC)
- `firebase-admin/messaging` for `send()`

Auth options:

- `FCM_USE_APPLICATION_DEFAULT=true` (ADC; recommended for GCP-hosted runtimes)
- `FCM_SERVICE_ACCOUNT_JSON_PATH` (recommended for production if you mount secrets)
- `FCM_SERVICE_ACCOUNT_JSON` (useful for local/dev, but avoid in production if possible)

### Dependencies

Phase 1 depends on:

- `firebase-admin`

## Configuration

Suggested env vars:

- `PUSH_PROVIDER` = `FCM` (optional; default “disabled”)
- `FCM_PROJECT_ID`
- `FCM_USE_APPLICATION_DEFAULT=true` **or** `FCM_SERVICE_ACCOUNT_JSON_PATH` **or** `FCM_SERVICE_ACCOUNT_JSON`

When any required key is missing:

- `PushService.isEnabled() === false`
- token registration endpoint returns `501 PUSH_NOT_CONFIGURED` (explicit, not silent)

## Security considerations

- Treat `pushToken` as sensitive:
  - never log it
  - never return it via APIs
  - store only what’s necessary
- Revoke token on session revoke to prevent delivery to “logged out” sessions.
- iOS note:
  - FCM delivery to iOS still requires an APNs key configured in the Firebase project.
  - Apple Developer Program is required for APNs keys.

## Error codes (proposal)

- `PUSH_NOT_CONFIGURED` (501)
- `PUSH_SEND_FAILED` (502 or 500, only for terminal provider failures)
- reuse existing `VALIDATION_FAILED`, `UNAUTHORIZED`, `RATE_LIMITED` where applicable

## Test plan (proposal)

- Unit tests:
  - `PushService` disabled mode when config missing
  - FCM adapter token minting + request shaping (mock HTTP)
  - “unregistered token” handling triggers token revocation in DB
- Integration tests:
  - enqueue `push.send` job and validate worker reads session/token and attempts send (mock provider)

## Open questions

1. Do we want to allow registering a token to a session that was created without `deviceId`? (Recommendation: yes.)
2. Should we rate limit `PUT /v1/me/push-token`? (Recommendation: low limit to avoid client loops, but not mandatory.)
3. Should we introduce encryption-at-rest for `pushToken`? (Not required for v1; consider later if needed.)
