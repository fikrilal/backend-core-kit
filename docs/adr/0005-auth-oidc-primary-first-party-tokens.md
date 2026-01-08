# ADR: OIDC as Primary Auth, Issue First-Party Access/Refresh Tokens

- Status: Accepted
- Date: 2026-01-08
- Decision makers: Core kit maintainers

## Context

Future projects need enterprise-grade authentication:
- many will use an external IdP (OIDC)
- some need first-party password auth

We want a consistent authorization/session model across projects regardless of login method.

## Decision

- OIDC (“bring your own IdP”) is the primary login method.
- Password auth is also first-class and supported.
- Both login methods mint the same first-party session tokens:
  - access token (JWT)
  - refresh token (rotated and server-revocable)

## Rationale

- Separating login method (OIDC/password) from session tokens provides consistent downstream behavior.
- First-party tokens allow:
  - consistent claims
  - consistent RBAC enforcement
  - centralized revocation and session controls

## Consequences

- The backend must verify OIDC assertions and map them to internal users.
- The kit must maintain refresh token rotation/revocation state.

## Alternatives Considered

- “Pass-through” IdP access/refresh tokens: rejected (inconsistent claims, harder RBAC, complicated token lifecycles, provider lock-in).
- OIDC-only (no password): rejected (some projects require password auth).

## Links / References

- `docs/standards/authentication.md`

