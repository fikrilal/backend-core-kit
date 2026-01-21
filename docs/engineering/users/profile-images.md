# Profile Images (S3-compatible, private by default)

This document describes the **profile image** upload flow implemented in this core kit.

Key goals:

- Upload bytes **direct-to-object-storage** (no API proxying).
- Keep the bucket **private by default** (signed URLs for upload and view).
- Server-side finalize step ensures the uploaded object matches policy before linking it to `UserProfile`.
- Cleanup is done via **BullMQ jobs** (best-effort + retries) with an **abandoned upload expiry** job.

## Storage configuration

The storage adapter uses the AWS SDK v3 S3 client against any **S3-compatible** provider (Cloudflare R2, MinIO, AWS S3, etc.).

Required env vars:

- `STORAGE_S3_ENDPOINT`
- `STORAGE_S3_REGION`
- `STORAGE_S3_BUCKET`
- `STORAGE_S3_ACCESS_KEY_ID`
- `STORAGE_S3_SECRET_ACCESS_KEY`
- `STORAGE_S3_FORCE_PATH_STYLE` (boolean; typically `true` for MinIO, typically `false` for AWS S3)

When storage is not configured, profile-image endpoints return `501 USERS_OBJECT_STORAGE_NOT_CONFIGURED`.

## Data model (Prisma)

The upload flow persists files in `StoredFile`:

- `purpose = PROFILE_IMAGE`
- `status = UPLOADING | ACTIVE | DELETED`
- `objectKey` is server-generated: `users/{userId}/profile-images/{fileId}`

The current profile image is referenced by:

- `UserProfile.profileImageFileId: uuid? -> StoredFile.id`

## Endpoints

All endpoints require `Authorization: Bearer <access token>`.

### 1) Create upload plan

`POST /v1/me/profile-image/upload`

Body:

```json
{ "contentType": "image/png", "sizeBytes": 12345 }
```

Policy:

- Allowed `contentType`: `image/jpeg`, `image/png`, `image/webp`
- Max size: `5_000_000` bytes

Behavior:

- Creates a `StoredFile` row with `status=UPLOADING`.
- Returns a short-lived presigned **PUT** URL. The URL signs the `Content-Type` header; the client must send it exactly.
  - Current TTL: 10 minutes (platform max: 15 minutes).
- Schedules an **abandoned upload expiry** job (default: 2 hours).
- Rate-limited (Redis) to prevent abuse/loops.

Response (success envelope):

```json
{
  "data": {
    "fileId": "uuid",
    "upload": {
      "method": "PUT",
      "url": "https://...",
      "headers": { "Content-Type": "image/png" }
    },
    "expiresAt": "2026-01-13T00:00:00.000Z"
  }
}
```

Notes:

- Optional `Idempotency-Key` is supported for this endpoint.

### 2) Finalize upload + attach to profile

`POST /v1/me/profile-image/complete`

Body:

```json
{ "fileId": "uuid" }
```

Behavior:

- Loads `StoredFile` by `(id=fileId, ownerUserId=currentUser)`.
  - If not found → `404`.
- `HEAD` the object in storage and verify:
  - it exists
  - `Content-Length === sizeBytes`
  - `Content-Type === contentType`
- Transaction:
  - marks uploaded file `ACTIVE` + sets `uploadedAt`
  - sets `UserProfile.profileImageFileId=fileId` (upsert profile row)
  - marks any previous profile image file as `DELETED` (logical delete)
- Enqueues a **deleteStoredFile** job for the previous file id (physical delete is async).

Response:

- `204 No Content`

### 3) Get view URL (signed GET)

`GET /v1/me/profile-image/url`

Behavior:

- If no profile image is set → `204 No Content`
- Otherwise returns a short-lived presigned **GET** URL:
  - Current TTL: 15 minutes (platform max: 15 minutes).

```json
{ "data": { "url": "https://...", "expiresAt": "..." } }
```

### 4) Clear profile image

`DELETE /v1/me/profile-image`

Behavior:

- Transactional detach: sets `UserProfile.profileImageFileId = null`
- Marks the stored file as `DELETED` (logical delete)
- Enqueues a **deleteStoredFile** job (physical delete is async)

Response:

- `204 No Content`

## Rate limiting

`POST /v1/me/profile-image/upload` uses Redis-based rate limiting. Defaults (can be overridden):

- Per-user
  - `USERS_PROFILE_IMAGE_UPLOAD_USER_MAX_ATTEMPTS` (default `20`)
  - `USERS_PROFILE_IMAGE_UPLOAD_USER_WINDOW_SECONDS` (default `3600`)
  - `USERS_PROFILE_IMAGE_UPLOAD_USER_BLOCK_SECONDS` (default `900`)
- Per-IP
  - `USERS_PROFILE_IMAGE_UPLOAD_IP_MAX_ATTEMPTS` (default `60`)
  - `USERS_PROFILE_IMAGE_UPLOAD_IP_WINDOW_SECONDS` (default `300`)
  - `USERS_PROFILE_IMAGE_UPLOAD_IP_BLOCK_SECONDS` (default `900`)

On exceed: `429 RATE_LIMITED`.

## Cleanup jobs (BullMQ)

Queue: `users`

### A) `users.profileImage.deleteStoredFile`

Enqueued when:

- profile image is replaced (after `/complete`)
- profile image is cleared (after `DELETE /v1/me/profile-image`)

Behavior (idempotent):

- Loads `StoredFile` by `(fileId, ownerUserId)`; no-op if missing.
- Deletes the object (NotFound is treated as success).
- Ensures DB record is `DELETED`.

Job id: `users.profileImage.deleteStoredFile-<fileId>`

### B) `users.profileImage.expireUpload`

Enqueued when:

- `/upload` succeeds, as a delayed job

Behavior:

- If file is still `UPLOADING`, best-effort delete object + mark DB record `DELETED`.

Delay:

- `USERS_PROFILE_IMAGE_UPLOAD_EXPIRE_DELAY_SECONDS` (default `7200` = 2 hours)

Job id: `users.profileImage.expireUpload-<fileId>`

## Local testing (MinIO)

`npm run verify:e2e` brings up:

- Postgres: `127.0.0.1:54321`
- Redis: `127.0.0.1:63790`
- MinIO (S3 API): `127.0.0.1:59090`
- MinIO console: `127.0.0.1:59091`

The e2e suite covers the full happy-path upload + finalize + view URL, plus rate limiting.
