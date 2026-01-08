# ADR: Asymmetric JWT Signing with JWKS and Key Rotation

- Status: Accepted
- Date: 2026-01-08
- Decision makers: Core kit maintainers

## Context

We need secure and operable token verification:
- token verification by other services and tooling should not require shared secrets
- keys must rotate safely
- compromised keys must be revocable

## Decision

- Access tokens are signed with asymmetric keys.
- Tokens include a `kid` header.
- The service exposes a JWKS endpoint at `/.well-known/jwks.json`.
- Key rotation is handled by deploying a configured key set containing current + previous keys.
- Supported algorithms:
  - EdDSA (Ed25519) as the recommended default
  - RS256 as a compatibility option

## Rationale

- Asymmetric signing avoids distributing shared secrets.
- JWKS is the standard mechanism for publishing public keys.
- `kid` enables safe rotation and verification of tokens signed by older keys.

## Consequences

- Operational work is required to manage signing keys securely.
- The system must keep old keys available until issued tokens expire.

## Alternatives Considered

- HS256 shared-secret signing: rejected (harder secret distribution and rotation at scale).
- Hard-coded/public key pinning in clients: rejected (operationally brittle).

## Links / References

- `docs/standards/authentication.md`
- `docs/standards/configuration.md`

