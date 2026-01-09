# Security Baseline

This document defines **minimum security requirements** for services built from this core kit.

Security is not a “feature module”; it is a baseline constraint across configuration, auth, data, logging, and CI/CD.

## Principles

- Secure by default; “unsafe” behavior must be explicit and documented.
- Fail closed (deny by default) on auth/authorization.
- Do not leak sensitive details in errors or logs.
- Prefer simple, auditable mechanisms over “clever” security.

## Transport Security

- All production traffic must be served over TLS.
- Prefer HSTS at the edge (gateway/load balancer).
- Never trust `X-Forwarded-*` headers unless behind a trusted proxy with explicit configuration.

## Input Validation & Payload Limits

Rules:

- Validate every request DTO.
- Reject unknown fields (`whitelist` + `forbidNonWhitelisted`).
- Enforce payload size limits (especially on auth endpoints).
- For file uploads: validate content type and size; never trust filenames.

## Authentication Safety

Password auth:

- Use Argon2id.
- Enforce a minimum password policy (project configurable).
- Apply rate limits and/or progressive backoff on login attempts.
- Avoid user enumeration (do not reveal whether an email exists).

OIDC:

- Verify signature using IdP JWKS.
- Validate issuer (`iss`) and audience (`aud`) strictly.
- Validate expiry and nonce where applicable.

Tokens:

- Use asymmetric signing + JWKS for access tokens.
- Keep token claims minimal (avoid PII).
- Refresh tokens must be rotated and server-revocable.

## Authorization Safety (RBAC)

Rules:

- Deny by default.
- Use explicit guards/decorators for capability checks.
- Log authorization failures with correlation IDs (but no sensitive payloads).

## Secrets Management

Rules:

- No secrets in git.
- No secrets baked into images.
- Secrets injected at runtime (env vars/secret manager/mounted files).
- Signing key rotation must be supported operationally.

## Logging & PII

Rules:

- Never log secrets (tokens, passwords, keys, auth headers).
- Minimize PII in logs; if needed, mask.
- Use request/job correlation IDs everywhere.

## Dependency & Supply Chain Security

Baseline expectations:

- Dependabot (or equivalent) enabled.
- Secret scanning enabled.
- Dependency vulnerability scanning in CI (best-effort; treat results as actionable, not noise).
- Prefer lockfiles committed and kept current.

## Incident Response Hooks (Baseline)

Operational capabilities the kit must support:

- revoke refresh tokens (logout sessions)
- rotate signing keys
- throttle/lock down auth endpoints during attack conditions
