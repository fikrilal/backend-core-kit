# ADR: Opaque Refresh Tokens with Rotation and Reuse Detection

- Status: Accepted
- Date: 2026-01-08
- Decision makers: Core kit maintainers

## Context

The core kit issues first-party session tokens for both OIDC and password login. We need a refresh token design that is:
- secure under token theft/replay scenarios
- rotation-friendly
- operationally simple
- consistent across projects

## Decision

Refresh tokens will be:

- **Opaque** (random, high-entropy strings), not JWTs.
- **Single-use** via rotation:
  - every successful refresh revokes the presented refresh token and issues a new one
- **Server-revocable**:
  - only a hash of the refresh token is stored server-side
  - revocation and session invalidation are enforced by server-side state
- **Reuse-detecting**:
  - presenting a previously rotated/revoked refresh token is treated as a compromise signal
  - the entire session (token family) is revoked and the client must re-authenticate

Access tokens remain JWTs signed asymmetrically with JWKS and key rotation (`kid`).

## Rationale

Opaque refresh tokens are a better fit for our requirements because:
- We need server-side state anyway (revocation, rotation, session management).
- JWT refresh tokens add extra signing key lifecycle complexity without removing DB lookups.
- Opaque tokens minimize claim leakage and keep refresh tokens as “pure secrets”.

Reuse detection is a pragmatic defense:
- refresh token theft is common; detecting replay enables rapid containment.

## Consequences

- Refresh always requires a DB lookup (by token hash).
- We need a session model (token family) to revoke all tokens on reuse detection.
- Key rotation complexity is isolated to access tokens (JWKS) rather than both access+refresh.

## Alternatives Considered

- JWT refresh tokens (signed):
  - rejected (still needs DB for revocation/rotation; harder key rotation; larger attack surface via claims)
- Long-lived refresh tokens without rotation:
  - rejected (high replay risk, weak containment on theft)

## Links / References

- `docs/standards/authentication.md`
- `docs/adr/0006-jwt-asymmetric-jwks-rotation.md`

