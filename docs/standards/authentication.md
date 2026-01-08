# Authentication Standard

This core kit supports two authentication entrypoints:

1) **OIDC (Bring Your Own IdP)** — primary login method.
2) **Password auth** — first-class and supported.

Both methods mint the same **first-party session tokens**:
- Access token (JWT): short-lived, sent as `Authorization: Bearer <token>`
- Refresh token: long-lived, rotated, used to obtain new access tokens

## Core Concepts

### Internal User vs External Identity

- **External identity**: identity asserted by an OIDC provider (subject, email, etc.).
- **Internal user**: the user record owned by this service.

OIDC login links an external identity to an internal user. The service then issues first-party tokens used across the platform.

### Sessions and Refresh Token Rotation

Refresh tokens must be:
- **rotated** on every successful refresh (issue a new refresh token, revoke the previous)
- **revocable** server-side (DB record)
- **replay-detecting** (reuse of a revoked token invalidates the session / triggers safety actions)

### Refresh Token Format (Decision)

Refresh tokens are **opaque** secrets (random strings), not JWTs.

Rationale:
- we require server-side state for revocation/rotation anyway
- opaque tokens minimize claim leakage and keep the refresh token lifecycle independent from JWT key rotation

See ADR: `docs/adr/0010-refresh-tokens-opaque-rotation.md`.

### Refresh Token Storage Model (Baseline)

Server stores only a hash of the refresh token (never the raw token).

Recommended fields (conceptual):
- `id` (token record id)
- `sessionId` (token family / session)
- `userId`
- `tokenHash` (e.g., SHA-256 of the token string)
- `expiresAt`
- `revokedAt` (nullable)
- `replacedById` (nullable; points to the next token in the rotation chain)
- optional metadata: `createdIp`, `createdUserAgent`, `lastUsedAt`

### Reuse Detection (Baseline)

If a refresh token is presented and is already revoked/rotated:
- treat as compromise
- revoke the entire session (`sessionId`) and all associated refresh tokens
- require the client to re-authenticate

## Token Signing (Asymmetric + JWKS)

Access tokens are JWTs signed with an asymmetric keypair:
- include `kid` header for key selection
- publish public keys via JWKS
- rotate keys safely without breaking clients

### Algorithms

The kit is designed for:
- **EdDSA (Ed25519)** as the recommended default (modern, small keys), or
- **RS256** when compatibility constraints require it.

The selected algorithm and keys are configuration, not code changes.

### JWKS Endpoint

Expose:
- `GET /.well-known/jwks.json`

Rules:
- Only publish public keys (`kty`, `crv`/`n`/`e`, `kid`, `alg`, `use`).
- Never publish private key material.

### Key Rotation

Rotation procedure (baseline):
1) Add new keypair with a new `kid` to the signing key set.
2) Deploy; start signing new tokens with the new `kid`.
3) Keep old public keys in JWKS until all tokens signed by them have expired.
4) Remove old keys after the maximum token TTL window.

## Token Claims

Access token should include minimal, non-PII claims:
- `iss` (issuer)
- `aud` (audience)
- `sub` (internal user id)
- `exp`, `iat`
- `jti` (token id)
- `typ` (e.g., `access`)
- authorization context (e.g., roles) if required by downstream services

Rules:
- Do not put emails, names, or other PII into tokens unless required.
- Keep tokens small; prefer server-side lookups for heavy data.

## OIDC Integration (Primary)

Default supported pattern: **token exchange**.

High level:
1) Client completes OIDC login with an IdP and obtains an identity assertion (e.g., `id_token`).
2) Client calls the backend to exchange the assertion for first-party access+refresh tokens.
3) Backend validates the assertion (signature + issuer + audience + expiry + nonce where applicable).
4) Backend links/creates the internal user record and issues tokens.

Exact OIDC flows (auth code vs token exchange) are feature-specific and will be documented per project integration.

## Password Authentication

Password auth requirements:
- Hashing: **Argon2id**
- Policy: minimum length + basic complexity rules (project configurable)
- Lockout/backoff: rate limiting on login attempts (per IP + per identifier) via Redis
- No user enumeration: error messages must not reveal whether the account exists

## Endpoints (Conceptual)

Typical endpoints (names may vary by project):
- `POST /v1/auth/oidc/exchange`
- `POST /v1/auth/password/register`
- `POST /v1/auth/password/login`
- `POST /v1/auth/refresh`
- `POST /v1/auth/logout`

## Security Notes

- Refresh tokens must be treated as secrets (store only hashed server-side).
- Reuse detection should revoke the session and optionally require re-auth.
- Consider binding refresh tokens to device/session metadata (device id, ip hints) where appropriate.
