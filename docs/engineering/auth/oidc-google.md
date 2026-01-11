# OIDC (Google) — Exchange + Connect

This core kit supports OIDC login via **token exchange**: the client obtains an IdP `id_token`, then exchanges it for **first-party** access + refresh tokens.

This document covers the Google implementation.

## Endpoint

- `POST /v1/auth/oidc/exchange`
- `POST /v1/auth/oidc/connect` (requires `Authorization: Bearer <access-token>`)

Request body:

```json
{
  "provider": "GOOGLE",
  "idToken": "<google-id-token>",
  "deviceId": "optional-stable-device-id",
  "deviceName": "optional-human-friendly-device-name"
}
```

Success response:

- `200` with `{ data: { user, accessToken, refreshToken } }`

## Behavior (Important Semantics)

### 1) Verify the Google `id_token` (JWT)

The backend validates:

- signature (Google JWKS)
- `iss` is one of:
  - `https://accounts.google.com`
  - `accounts.google.com`
- `aud` matches one of the configured Google client IDs
- required claims exist (`sub`, `email`, `email_verified`)

If invalid:

- `401 AUTH_OIDC_TOKEN_INVALID`

If `email_verified` is false:

- `400 AUTH_OIDC_EMAIL_NOT_VERIFIED`

### 2) No silent auto-link by email

We do **not** auto-link a Google identity to an existing user account based purely on:

- same `email`, and
- `email_verified=true`

Instead:

1. If `(provider, subject)` is already linked → login succeeds.
2. Else, if a user exists with the same email → return a conflict telling the client to do a password login first, then link Google later.
3. Else → create a new user + link the external identity and login.

Conflict response:

- `409 AUTH_OIDC_LINK_REQUIRED`
- `detail` instructs the user to sign in with password to link Google sign-in.

## Connect (Authenticated)

When a user is already authenticated (e.g. from password login), the client can link Google to the current account:

- `POST /v1/auth/oidc/connect`

Request body:

```json
{
  "provider": "GOOGLE",
  "idToken": "<google-id-token>"
}
```

Response:

- `204` (idempotent success)

Rules:

- The backend verifies the `idToken` the same way as exchange.
- If the identity is already linked to the current user, the endpoint returns `204`.
- If the identity is linked to another user, the endpoint returns `409 AUTH_OIDC_IDENTITY_ALREADY_LINKED`.
- If the current user already linked a different Google identity, the endpoint returns `409 AUTH_OIDC_PROVIDER_ALREADY_LINKED`.
- If `email_verified=true` and the Google email matches `User.email`, the backend sets `User.emailVerifiedAt` (if not already set).

## Data Model

Google login uses `ExternalIdentity`:

- unique per `(provider, subject)` (the IdP subject is the stable key)
- unique per `(userId, provider)` (at most one Google identity per user)

## Configuration

Environment variables:

- `AUTH_OIDC_GOOGLE_CLIENT_IDS` (required to enable Google exchange)
  - comma-separated list of allowed client IDs (Android + iOS + web)

If not configured:

- `500 AUTH_OIDC_NOT_CONFIGURED`
