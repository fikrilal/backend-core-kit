# Platform auth audit

Date: 2026-01-19

## Scope

Included:

- `libs/platform/auth/**`
  - `access-token-verifier.service.ts`
  - `access-token.guard.ts`
  - `auth-keyring.service.ts`
  - decorators + types

Reviewed for context (out of scope):

- `docs/standards/authentication.md`
- `docs/standards/security.md`
- `docs/standards/error-codes.md`

Excluded:

- `libs/features/**` (token minting, JWKS endpoint exposure, refresh token/session checks)
- `libs/platform/http/**` (problem-details filter implementation)

Method:

- Static code review + reading unit tests in `libs/platform/auth/*.spec.ts`.
- No behavioral refactors were made as part of this audit.

## Snapshot

`libs/platform/auth` is relatively small and test-covered, and it matches the core kit’s baseline decisions:

- Access tokens are **asymmetrically signed JWTs** (`EdDSA`/`RS256`) with `kid`.
- Public keys are served via JWKS (via `AuthKeyRing.getPublicJwks()`; endpoint wiring is outside this folder).
- Request auth is **deny-by-default** via `AccessTokenGuard`, with explicit `@Public()` opt-out.
- Error handling returns RFC7807 with global codes (`UNAUTHORIZED`, `INTERNAL`) and does not leak details.

Main opportunities are:

1. **Hardening against misconfiguration** (alg/key mismatches and init-time failures).
2. **Abuse resistance** (token size limits / parse cost).
3. **Maintainability** (duplicate helpers, clearer operational knobs for key rotation).

## What’s working well

- **Correct boundaries**: platform auth does not depend on features.
- **Good default posture**:
  - Guard blocks by default; `@Public()` is explicit.
  - No token content is logged here (safe baseline).
- **Verifier is strict where it matters**:
  - Requires `kid`, `alg`, valid signature, `exp`, `typ === "access"`, and required identifiers (`sub`, `sid`).
  - Optional `iss`/`aud` enforcement when configured, and required in staging/production-like envs.
- **Key ring behavior matches docs**:
  - In staging/production, refuses to run without configured signing keys.
  - In dev/test, generates an ephemeral key for convenience.
- **Unit tests exist** for both the verifier and guard, including RS256 and EdDSA happy paths.

## Findings (prioritized)

### P0 — Security/robustness: `AuthKeyRing` trusts `alg` in config even if it conflicts with JWK type

Evidence:

- `AuthKeyRing` chooses algorithm as `item.alg ?? inferAlgFromJwk(jwk) ?? algConfig`:
  - `libs/platform/auth/auth-keyring.service.ts`
- `AccessTokenVerifier` uses the stored alg to choose the verification algorithm:
  - `libs/platform/auth/access-token-verifier.service.ts`

Why this matters:

- A misconfigured `AUTH_SIGNING_KEYS_JSON` entry can label an OKP/Ed25519 key as `RS256` (or vice-versa).
- That can cause verification to throw (not just fail), which becomes a **500** from `AccessTokenGuard` rather than a **401**.
- Result: confusing operational behavior and potential “cheap DoS” if a bad deploy ships a mismatched key set.

Recommendation:

- Validate alg/key compatibility at keyring init:
  - Derive alg from JWK (`kty`/`crv`) and reject entries whose explicit `alg` disagrees.
  - Or ignore `item.alg` entirely and always infer from the key type (preferred; simplest).
- Add a unit test for “mismatched JWK+alg is rejected at init”.

Status:

- Implemented (2026-01-19): `AuthKeyRing` now prefers inferring `alg` from the JWK type over `item.alg`; added `libs/platform/auth/auth-keyring.service.spec.ts` to lock behavior.

### P1 — Abuse resistance: no explicit token size limit before base64url decode + JSON parse

Evidence:

- `parseJwt` decodes and parses JWT header/payload without a max length guard:
  - `libs/platform/auth/access-token-verifier.service.ts`

Why this matters:

- Large tokens can cause avoidable allocations and CPU work (base64url decode + JSON parse) even though they’ll be rejected later.
- In practice, upstream HTTP payload/header limits mitigate this, but it’s a cheap local hardening win.

Recommendation:

- Add a max token length guard in `AccessTokenVerifier.verifyAccessToken(...)` (e.g., 8–16KB).
- Optionally, add per-segment size guards (header/payload/signature).
- Add unit coverage for “oversized token is rejected as invalid”.

Status:

- Implemented (2026-01-19): added a max token length guard in `AccessTokenVerifier` and unit coverage for oversized tokens.

### P1 — Maintainability: repeated small helpers (`asNonEmptyString`, `getNodeEnv`, `isObject`)

Evidence:

- Similar helpers are duplicated in:
  - `libs/platform/auth/access-token-verifier.service.ts`
  - `libs/platform/auth/auth-keyring.service.ts`

Why this matters:

- Small drift over time (especially around env semantics and “object” narrowing) increases review cost.

Recommendation:

- Centralize these under `libs/platform/config/**` or a small `libs/shared/strings.ts` + `libs/shared/objects.ts` (platform must not depend on features).
- Keep helpers tiny and well-tested (don’t introduce a heavy utility layer).

Status:

- Implemented (2026-01-19): consolidated shared helpers into `libs/platform/auth/auth.utils.ts` and reused in verifier + keyring.

### P2 — Observability: guard maps unknown verifier errors to 500 without logging

Evidence:

- `AccessTokenGuard` swallows unknown errors and returns a generic `INTERNAL` without emitting a log:
  - `libs/platform/auth/access-token.guard.ts`

Why this matters:

- Misconfigurations or keyring failures become “silent 500s” that are harder to debug in staging/prod.

Recommendation:

- Log verifier failures at error level with `requestId`/`traceId` and without sensitive payloads.
- Keep the response generic (current behavior is correct externally).

Status:

- Implemented (2026-01-19): `AccessTokenGuard` now logs unexpected verifier errors (without token data) and still returns a generic RFC7807 500.

### P2 — Token semantics: verifier does not validate `iat`/`nbf`/`jti`

Evidence:

- `AccessTokenVerifier` validates `exp` but not `iat`/`nbf`/`jti`:
  - `libs/platform/auth/access-token-verifier.service.ts`

Why this matters:

- Not always required, but these claims can improve replay and time-skew safety when adopted.

Recommendation:

- If the minting side already includes these claims, validate them here (with a small skew allowance).
- If not present, document the chosen minimal claim set (avoid partial/accidental adoption).

Status:

- Implemented (2026-01-19): `AccessTokenVerifier` now validates `iat` and requires `jti`; if `nbf` is present it is validated with a small skew allowance.

## Suggested next backlog (smallest-first)

1. ✅ Add token max-length guard + unit test(s). (done)
2. ✅ Validate alg/key compatibility in `AuthKeyRing` init + unit test(s). (done)
3. ✅ Add safe logging for unexpected verifier errors in `AccessTokenGuard`. (done)
4. ✅ Consolidate helper functions shared between verifier/keyring. (done)
