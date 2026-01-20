import { randomUUID } from 'crypto';

const MAX_REQUEST_ID_LENGTH = 128;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed !== '' ? trimmed : undefined;
}

function normalizeCandidate(value: unknown): string | undefined {
  const raw = asNonEmptyString(value);
  if (!raw) return undefined;
  if (raw.length > MAX_REQUEST_ID_LENGTH) return undefined;
  if (!REQUEST_ID_PATTERN.test(raw)) return undefined;
  return raw;
}

function firstHeaderValue(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.length > 0 ? value[0] : undefined;
}

export function normalizeRequestId(value: unknown): string | undefined {
  return normalizeCandidate(firstHeaderValue(value));
}

export function getOrCreateRequestId(params: {
  headerValue: unknown;
  existingRequestId?: unknown;
  existingId?: unknown;
}): string {
  return (
    normalizeRequestId(params.headerValue) ??
    normalizeRequestId(params.existingRequestId) ??
    normalizeRequestId(params.existingId) ??
    randomUUID()
  );
}
