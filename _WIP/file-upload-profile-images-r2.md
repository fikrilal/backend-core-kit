# Engineering Proposal: File Uploads (Profile Images) via Cloudflare R2

## Goal

Support **profile image uploads** in a production-grade way that:

- scales (does not stream large uploads through the API)
- is secure-by-default (authz + content validation + abuse controls)
- is vendor-flexible (R2 is S3-compatible; we keep a clean storage port)
- fits the repo architecture (platform abstractions + feature-level orchestration)

Primary use case: **user profile image** for mobile/web clients.

## Non-goals (v1)

- General-purpose file upload for arbitrary features (docs, attachments, etc.).
- Image transformations (resize/crop/thumbnail) and EXIF stripping.
- Public CDN delivery rules and caching strategy (we can add later).

## High-level approach (recommended)

Use **direct-to-R2 uploads** with **pre-signed URLs** + a **server-side finalize step**:

1. Client asks the API for an upload plan (authenticated).
2. API creates a DB record (status `UPLOADING`) and returns a pre-signed URL.
3. Client uploads bytes directly to R2 using that URL (no API proxying).
4. Client calls a “complete/finalize” endpoint.
5. API verifies the object exists and meets policy, then links it to the user profile.
6. Old profile images are deleted asynchronously via worker (best-effort).

This mirrors how enterprise backends typically handle uploads while keeping auth decisions in the API.

## Storage provider choice: Cloudflare R2

Cloudflare R2 is **S3-compatible** and has a favorable cost model for images (notably egress).
We should implement a storage adapter via the AWS SDK v3 S3 client configured for R2 endpoint.

Key operational requirement: R2 bucket must be private; uploads/downloads are signed.

## Domain + data model (Prisma)

Introduce a reusable storage primitive (platform-agnostic): `StoredFile`.

### New enums

- `FilePurpose`: `PROFILE_IMAGE` (start small; can extend later)
- `FileStatus`: `UPLOADING | ACTIVE | DELETED`

### New model: `StoredFile`

Fields (proposed):

- `id: uuid`
- `ownerUserId: uuid` (required)
- `purpose: FilePurpose`
- `status: FileStatus`
- `bucket: string` (store actual bucket name for portability)
- `objectKey: string` (server-generated; never client-provided)
- `contentType: string` (declared at create; verified at finalize)
- `sizeBytes: int` (declared at create; verified at finalize)
- `createdAt: datetime`
- `uploadedAt: datetime?` (set at finalize)
- `deletedAt: datetime?` (set at delete)
- `traceId: string?` (optional, for support correlation)

Indexes:

- `@@index([ownerUserId, createdAt])`
- `@@unique([bucket, objectKey])`

### Link from profile

Add `UserProfile.profileImageFileId: uuid?` referencing `StoredFile(id)` (nullable).

Behavior:

- Only one current profile image per user (the foreign key enforces that at the profile layer).
- When updating, we switch the FK to the new file; old file is scheduled for deletion.

## API surface (v1)

All endpoints are authenticated (`AccessTokenGuard`) and operate on the **current user**.

### 1) Create upload

`POST /v1/me/profile-image/upload`

Request body:

- `contentType` (string)
- `sizeBytes` (int)

Validation/policy:

- allowlist `contentType`: `image/jpeg`, `image/png`, `image/webp`
- `sizeBytes` max (config): e.g. `PROFILE_IMAGE_MAX_BYTES=5_000_000`

Response (enveloped):

```json
{
  "data": {
    "fileId": "uuid",
    "upload": {
      "method": "PUT",
      "url": "https://<r2-presigned-url>",
      "headers": {
        "Content-Type": "image/webp"
      }
    },
    "expiresAt": "ISO datetime"
  }
}
```

Notes:

- Prefer pre-signed **PUT** for simplicity.
- The URL TTL should be short (e.g. 5–15 minutes).
- The API must generate `objectKey` (example): `users/<userId>/profile/<fileId>`

### 2) Finalize upload (attach to profile)

`POST /v1/me/profile-image/complete`

Request body:

- `fileId: uuid`

Server-side checks:

- DB record exists, belongs to user, `status=UPLOADING`
- R2 `HEAD` object:
  - object exists
  - `Content-Length == sizeBytes` (exact match) or within tight bounds
  - content type is acceptable (use `HEAD`’s metadata if reliable; otherwise treat declared contentType as advisory and enforce via later scanning/transform pipeline)

Result:

- set `StoredFile.status=ACTIVE`
- set `StoredFile.uploadedAt=now`
- update `UserProfile.profileImageFileId=fileId`
- enqueue deletion job for previous profile image (best-effort)

Response:

- `204 No Content` (or return updated `me` envelope; pick one and keep consistent)

### 3) Clear profile image (optional v1)

`DELETE /v1/me/profile-image`

- Sets `UserProfile.profileImageFileId = null`
- Enqueues deletion of the old file object (best-effort)
- `204 No Content`

## Serving images (delivery strategy)

We need a client-consumable URL. Two viable patterns:

### Option A (default, safest): signed download URLs

- API returns a **short-lived signed GET URL** in `GET /v1/me` (or a dedicated endpoint).
- Pros: bucket stays private; least leakage risk.
- Cons: URL expires; clients must refresh.

### Option B (public delivery): public R2 + unguessable keys

- Use public bucket + store images with unguessable keys.
- Pros: easiest client integration + caching.
- Cons: privacy risk; cannot “un-leak” if URL escapes.

Recommendation: start with **Option A** until product requirements explicitly demand public/CDN.

## Platform components (where code will live)

### `libs/platform/storage/`

- `ObjectStorage` port (S3-like):
  - `presignPutObject(...)`
  - `headObject(...)`
  - `deleteObject(...)`
  - `presignGetObject(...)` (if we choose signed download)
- `R2ObjectStorage` adapter using AWS SDK v3 `S3Client` configured with:
  - endpoint, region, credentials, bucket
  - path-style setting if needed (provider-specific)

### Feature wiring

- User feature adds:
  - controller endpoints under `libs/features/users/infra/http/`
  - app service orchestration under `libs/features/users/app/`
  - Prisma repository under `libs/features/users/infra/persistence/`
- Worker adds:
  - deletion job processor to delete old images and mark `StoredFile` deleted

## Abuse protection + security

- Rate limit `create upload` per user + IP (Redis).
- Enforce `sizeBytes` max and allowlisted `contentType`.
- Never trust filenames; never accept a client-provided `objectKey`.
- Use short presign TTLs.
- Ensure the API checks auth/authorization before producing upload URLs.
- Consider scanning/transforms later (EXIF stripping, resizing) if this becomes user-generated content at scale.

## Cleanup strategy

Two layers:

1. **Application cleanup**: on profile-image replace/clear, enqueue a job to delete the old R2 object and mark the DB record deleted.
2. **Bucket lifecycle** (recommended): auto-delete abandoned `UPLOADING` objects by prefix and age (defense-in-depth).

## Observability

- Include `traceId` in `StoredFile` records (from `X-Request-Id`) for support/debug.
- Queue jobs should inherit trace context via the existing job meta propagation.

## Test plan

- E2E (API):
  - create upload returns presigned URL + fileId
  - complete fails if fileId not found / belongs to someone else
  - complete succeeds when `headObject` indicates object exists (mock adapter for tests)
- Unit (platform adapter):
  - presign method produces URL; headers are as expected

## Open questions (must decide before implementation)

1. Delivery: signed GET URLs (private bucket) vs public bucket/CDN.
2. Max size for profile image (default recommendation: 5 MB).
3. Whether v1 includes `DELETE /v1/me/profile-image` or only supports replacement.
