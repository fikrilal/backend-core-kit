# FCM Push Infrastructure

This kit uses `firebase-admin` (Firebase Cloud Messaging) to send push notifications.

This document focuses on the **platform push infrastructure**.

## Configuration

Environment variables:

- `PUSH_PROVIDER=FCM`
- `FCM_PROJECT_ID`
- Credentials (choose one):
  - `FCM_USE_APPLICATION_DEFAULT=true` (ADC)
  - `FCM_SERVICE_ACCOUNT_JSON_PATH` (preferred in production; mounted secret file)
  - `FCM_SERVICE_ACCOUNT_JSON` (dev convenience; not recommended for production)

Notes:

- Push is optional; if not configured, the platform uses a disabled provider.
- Config is validated at startup in `libs/platform/config/env.validation.ts`.

## Platform module

Code lives in `libs/platform/push/`.

- Nest module: `libs/platform/push/push.module.ts:1` (`PlatformPushModule`)
- Provider:
  - `libs/platform/push/fcm-push.service.ts:1` (`FcmPushService`)
  - `libs/platform/push/disabled-push.service.ts:1` (`DisabledPushService`)
- Job helper: `libs/platform/push/push.jobs.ts:1` (`PushJobs`)

## Payload guidance (keep it small)

FCM enforces message size limits. Treat push payloads as **small metadata**:

- Prefer IDs and short action strings in `data` (client fetches details from the API).
- Avoid large JSON blobs and avoid PII in push payloads.
- Keep `data` values as short strings (the platform type is `Record<string, string>`).

## Error handling model

Push errors are surfaced as `PushSendError`:

- `code` is a stable internal `PushErrorCode` (for branching/metrics).
- `providerCode` (optional) contains the raw provider-specific error code (opaque string).

Worker behavior (out of scope here, but important):

- invalid/unregistered tokens are treated as non-retryable and the session token is cleared.
