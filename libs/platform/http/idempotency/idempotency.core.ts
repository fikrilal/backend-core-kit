import { createHash } from 'crypto';
import type { FastifyRequest } from 'fastify';

export type WriteMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const MAX_REQUEST_HASH_DEPTH = 5;
const MAX_REQUEST_HASH_ARRAY_LENGTH = 100;
const MAX_REQUEST_HASH_OBJECT_KEYS = 100;
const MAX_REQUEST_HASH_STRING_LENGTH = 1024;
const MAX_REQUEST_HASH_CHARS = 32_768;

export const MAX_REPLAY_RECORD_CHARS = 65_536;

export type InProgressRecord = Readonly<{
  v: 1;
  state: 'in_progress';
  requestHash: string;
  startedAt: number;
}>;

export type CompletedRecord = Readonly<{
  v: 1;
  state: 'completed';
  requestHash: string;
  status: number;
  hasBody: boolean;
  body?: unknown;
  headers?: Readonly<Record<string, string>>;
  completedAt: number;
}>;

export type StoredRecord = InProgressRecord | CompletedRecord;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed !== '' ? trimmed : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function clampString(value: string): string {
  if (value.length <= MAX_REQUEST_HASH_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_REQUEST_HASH_STRING_LENGTH)}…`;
}

function stableStringify(value: unknown, depth = 0): string {
  if (depth > MAX_REQUEST_HASH_DEPTH) return JSON.stringify('__idempotency_depth_exceeded__');

  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return JSON.stringify(clampString(value));
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';

  if (Array.isArray(value)) {
    const truncated = value.length > MAX_REQUEST_HASH_ARRAY_LENGTH;
    const slice = value.slice(0, MAX_REQUEST_HASH_ARRAY_LENGTH);
    const inner = slice.map((v) => stableStringify(v, depth + 1)).join(',');
    const marker = truncated ? ',"__idempotency_truncated_array__"' : '';
    return `[${inner}${marker}]`;
  }

  if (Buffer.isBuffer(value)) {
    return JSON.stringify(value.toString('base64'));
  }

  if (!isRecord(value)) {
    return JSON.stringify(clampString(String(value)));
  }

  const keys = Object.keys(value).sort();
  const truncated = keys.length > MAX_REQUEST_HASH_OBJECT_KEYS;
  const limitedKeys = keys.slice(0, MAX_REQUEST_HASH_OBJECT_KEYS);
  const parts: string[] = [];
  for (const key of limitedKeys) {
    parts.push(`${JSON.stringify(key)}:${stableStringify(value[key], depth + 1)}`);
  }
  if (truncated) {
    parts.push(`${JSON.stringify('__idempotency_truncated_object__')}:${JSON.stringify(true)}`);
  }

  const out = `{${parts.join(',')}}`;
  return out.length <= MAX_REQUEST_HASH_CHARS ? out : out.slice(0, MAX_REQUEST_HASH_CHARS);
}

function sha256Base64Url(input: string): string {
  return createHash('sha256').update(input).digest('base64url');
}

export function hashScopeKey(scopeKey: string): string {
  return sha256Base64Url(scopeKey);
}

export function isWriteMethod(value: unknown): value is WriteMethod {
  return value === 'POST' || value === 'PUT' || value === 'PATCH' || value === 'DELETE';
}

export function getIdempotencyKeyHeader(req: FastifyRequest): string | undefined {
  const raw = req.headers['idempotency-key'];
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw[0];
  return undefined;
}

export function parseRecord(raw: string): StoredRecord | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }

  if (!isRecord(parsed)) return undefined;
  if (parsed.v !== 1) return undefined;

  const state = asNonEmptyString(parsed.state);
  const requestHash = asNonEmptyString(parsed.requestHash);
  if (!state || !requestHash) return undefined;

  if (state === 'in_progress') {
    const startedAt = asFiniteNumber(parsed.startedAt);
    if (startedAt === undefined) return undefined;
    return { v: 1, state: 'in_progress', requestHash, startedAt };
  }

  if (state !== 'completed') return undefined;

  const status = asFiniteNumber(parsed.status);
  const hasBody = typeof parsed.hasBody === 'boolean' ? parsed.hasBody : undefined;
  const completedAt = asFiniteNumber(parsed.completedAt);
  if (status === undefined || hasBody === undefined || completedAt === undefined) return undefined;

  const headersRaw = parsed.headers;
  const headers: Record<string, string> = {};
  if (headersRaw && isRecord(headersRaw)) {
    for (const [k, v] of Object.entries(headersRaw)) {
      const s = asNonEmptyString(v);
      if (s) headers[k] = s;
    }
  }

  const record: CompletedRecord = {
    v: 1,
    state: 'completed',
    requestHash,
    status: Math.trunc(status),
    hasBody,
    ...(hasBody ? { body: (parsed as { body?: unknown }).body } : {}),
    ...(Object.keys(headers).length ? { headers } : {}),
    completedAt,
  };
  return record;
}

export function createInProgressRecord(
  requestHash: string,
  startedAt = Date.now(),
): InProgressRecord {
  return { v: 1, state: 'in_progress', requestHash, startedAt };
}

export function createCompletedRecord(input: {
  requestHash: string;
  status: number;
  body: unknown;
  headers: Readonly<Record<string, string>>;
  completedAt?: number;
}): CompletedRecord {
  return {
    v: 1,
    state: 'completed',
    requestHash: input.requestHash,
    status: Math.trunc(input.status),
    hasBody: input.body !== undefined && input.status !== 204,
    ...(input.body !== undefined && input.status !== 204 ? { body: input.body } : {}),
    ...(Object.keys(input.headers).length ? { headers: input.headers } : {}),
    completedAt: input.completedAt ?? Date.now(),
  };
}

export function computeRequestHash(req: FastifyRequest, method: WriteMethod): string {
  const url = asNonEmptyString(req.url) ?? '';
  let path = url;
  try {
    path = new URL(url, 'http://localhost').pathname;
  } catch {
    // ignore
  }

  const payload = {
    method,
    path,
    query: req.query,
    body: req.body,
  };

  return sha256Base64Url(stableStringify(payload));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
