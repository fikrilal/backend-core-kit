# Resend Email Infrastructure

This kit uses the official Resend Node SDK for outbound transactional email.

This document focuses on the **platform email infrastructure** (not the auth “verify email” feature wiring yet).

## Configuration

Environment variables:

- `RESEND_API_KEY` (secret)
- `EMAIL_FROM` (e.g. `onboarding@example.com` or `Acme <onboarding@acme.com>`)
- `EMAIL_REPLY_TO` (optional)

Notes:

- `RESEND_API_KEY` and `EMAIL_FROM` must be configured together (validated at startup).
- Never commit secrets; inject them at runtime.

## Platform module

Code lives in `libs/platform/email/`.

- Nest module: `libs/platform/email/email.module.ts:1` (`PlatformEmailModule`)
- Service: `libs/platform/email/email.service.ts:1` (`EmailService`)

The service is intentionally small and provider-focused:

- `EmailService.isEnabled()` returns whether email is configured.
- `EmailService.send(...)` sends via Resend and returns `{ id }`.

## Usage (example)

Inject `EmailService` from a feature infra module:

```ts
import { EmailService } from '../../../platform/email/email.service';

constructor(private readonly email: EmailService) {}
```

Send a simple email:

```ts
await this.email.send({
  to: 'user@example.com',
  subject: 'Verify your email',
  text: 'Your verification code is 123456',
});
```

## Reliability guidance

For production UX and resilience:

- Prefer sending emails from a **BullMQ job** instead of blocking request/response latency.
- Treat email delivery as “at least once”: retries can cause duplicate emails; design your verification flow accordingly.
