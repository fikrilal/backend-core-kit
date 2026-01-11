import { createHash } from 'crypto';
import { Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ErrorCode } from '../errors/error-codes';
import { ProblemException } from '../errors/problem.exception';
import { RedisService } from '../../redis/redis.service';
import type { IdempotencyOptions } from './idempotency.decorator';

type WriteMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

type InProgressRecord = Readonly<{
  v: 1;
  state: 'in_progress';
  requestHash: string;
  startedAt: number;
}>;

type CompletedRecord = Readonly<{
  v: 1;
  state: 'completed';
  requestHash: string;
  status: number;
  hasBody: boolean;
  body?: unknown;
  headers?: Readonly<Record<string, string>>;
  completedAt: number;
}>;

type StoredRecord = InProgressRecord | CompletedRecord;

export type IdempotencyBeginResult =
  | Readonly<{
      kind: 'skip';
    }>
  | Readonly<{
      kind: 'acquired';
      redisKey: string;
      requestHash: string;
      ttlSeconds: number;
      lockTtlSeconds: number;
      waitMs: number;
    }>
  | Readonly<{
      kind: 'replay';
      redisKey: string;
      record: CompletedRecord;
    }>
  | Readonly<{
      kind: 'in_progress';
      redisKey: string;
      requestHash: string;
      waitMs: number;
    }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed !== '' ? trimmed : undefined;
}

function asFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (Buffer.isBuffer(value)) {
    return JSON.stringify(value.toString('base64'));
  }

  if (!isRecord(value)) {
    return JSON.stringify(String(value));
  }

  const keys = Object.keys(value).sort();
  const parts: string[] = [];
  for (const key of keys) {
    const v = (value as Record<string, unknown>)[key];
    parts.push(`${JSON.stringify(key)}:${stableStringify(v)}`);
  }
  return `{${parts.join(',')}}`;
}

function sha256Base64Url(input: string): string {
  return createHash('sha256').update(input).digest('base64url');
}

function isWriteMethod(value: unknown): value is WriteMethod {
  return value === 'POST' || value === 'PUT' || value === 'PATCH' || value === 'DELETE';
}

function getIdempotencyKeyHeader(req: FastifyRequest): string | undefined {
  const raw = req.headers['idempotency-key'];
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw[0];
  return undefined;
}

function parseRecord(raw: string): StoredRecord | undefined {
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

@Injectable()
export class IdempotencyService {
  constructor(private readonly redis: RedisService) {}

  async begin(
    req: FastifyRequest,
    options: IdempotencyOptions,
    scopeKeyFallback: string,
  ): Promise<IdempotencyBeginResult> {
    const method = req.method?.toUpperCase();
    if (!isWriteMethod(method)) {
      throw new ProblemException(500, {
        title: 'Internal Server Error',
        code: ErrorCode.INTERNAL,
        detail: 'Idempotency is only supported for write endpoints',
      });
    }

    const required = options.required ?? false;
    const header = asNonEmptyString(getIdempotencyKeyHeader(req));
    if (!header) {
      if (!required) return { kind: 'skip' };

      throw new ProblemException(400, {
        title: 'Validation Failed',
        code: ErrorCode.VALIDATION_FAILED,
        errors: [{ field: 'Idempotency-Key', message: 'Idempotency-Key header is required' }],
      });
    }

    if (!this.redis.isEnabled()) {
      throw new ProblemException(500, {
        title: 'Internal Server Error',
        code: ErrorCode.INTERNAL,
        detail: 'Redis is not configured (required for idempotency)',
      });
    }

    if (header.length > 128) {
      throw new ProblemException(400, {
        title: 'Validation Failed',
        code: ErrorCode.VALIDATION_FAILED,
        errors: [{ field: 'Idempotency-Key', message: 'Idempotency-Key header is too long' }],
      });
    }

    const principal = req.principal;
    const userId = principal ? asNonEmptyString(principal.userId) : undefined;
    if (!userId) {
      throw new ProblemException(500, {
        title: 'Internal Server Error',
        code: ErrorCode.INTERNAL,
        detail: 'Idempotency requires an authenticated principal (missing AccessTokenGuard?)',
      });
    }

    const scopeKey = asNonEmptyString(options.scopeKey) ?? scopeKeyFallback;
    const scopeHash = sha256Base64Url(scopeKey);
    const redisKey = `idempotency:v1:${userId}:${scopeHash}:${header}`;

    const requestHash = this.computeRequestHash(req, method);
    const ttlSeconds = options.ttlSeconds ?? 60 * 60 * 24;
    const waitMs = options.waitMs ?? 2000;
    const lockTtlSeconds = options.lockTtlSeconds ?? 30;

    const client = this.redis.getClient();
    const inProgress: InProgressRecord = {
      v: 1,
      state: 'in_progress',
      requestHash,
      startedAt: Date.now(),
    };

    const created = await client.set(
      redisKey,
      JSON.stringify(inProgress),
      'EX',
      lockTtlSeconds,
      'NX',
    );
    if (created === 'OK') {
      return { kind: 'acquired', redisKey, requestHash, ttlSeconds, lockTtlSeconds, waitMs };
    }

    const existingRaw = await client.get(redisKey);
    if (!existingRaw) {
      // Race with expiry/eviction: try once more to acquire.
      const retry = await client.set(
        redisKey,
        JSON.stringify(inProgress),
        'EX',
        lockTtlSeconds,
        'NX',
      );
      if (retry === 'OK') {
        return { kind: 'acquired', redisKey, requestHash, ttlSeconds, lockTtlSeconds, waitMs };
      }

      throw new ProblemException(409, {
        title: 'Conflict',
        code: ErrorCode.IDEMPOTENCY_IN_PROGRESS,
        detail: 'An identical request is already in progress',
      });
    }

    const existing = parseRecord(existingRaw);
    if (!existing) {
      throw new ProblemException(409, {
        title: 'Conflict',
        code: ErrorCode.IDEMPOTENCY_IN_PROGRESS,
        detail: 'An identical request is already in progress',
      });
    }

    if (existing.requestHash !== requestHash) {
      throw new ProblemException(409, {
        title: 'Conflict',
        code: ErrorCode.CONFLICT,
        detail: 'Idempotency-Key reuse with a different request payload',
      });
    }

    if (existing.state === 'completed') {
      return { kind: 'replay', redisKey, record: existing };
    }

    return { kind: 'in_progress', redisKey, requestHash, waitMs };
  }

  async waitForCompletion(
    redisKey: string,
    requestHash: string,
    waitMs: number,
  ): Promise<CompletedRecord | undefined> {
    if (!this.redis.isEnabled()) return undefined;
    if (waitMs <= 0) return undefined;

    const client = this.redis.getClient();
    const deadline = Date.now() + waitMs;

    let delay = 50;
    while (Date.now() < deadline) {
      await sleep(delay);
      delay = Math.min(delay * 2, 250);

      const raw = await client.get(redisKey);
      if (!raw) return undefined;

      const record = parseRecord(raw);
      if (!record) return undefined;

      if (record.requestHash !== requestHash) {
        throw new ProblemException(409, {
          title: 'Conflict',
          code: ErrorCode.CONFLICT,
          detail: 'Idempotency-Key reuse with a different request payload',
        });
      }

      if (record.state === 'completed') return record;
    }

    return undefined;
  }

  async complete(
    redisKey: string,
    requestHash: string,
    status: number,
    body: unknown,
    headers: Readonly<Record<string, string>>,
    ttlSeconds: number,
  ): Promise<void> {
    if (!this.redis.isEnabled()) return;

    // Only cache successful responses; do not cache errors.
    if (status >= 400) {
      await this.release(redisKey, requestHash);
      return;
    }

    const completed: CompletedRecord = {
      v: 1,
      state: 'completed',
      requestHash,
      status: Math.trunc(status),
      hasBody: body !== undefined && status !== 204,
      ...(body !== undefined && status !== 204 ? { body } : {}),
      ...(Object.keys(headers).length ? { headers } : {}),
      completedAt: Date.now(),
    };

    const client = this.redis.getClient();
    await client.set(redisKey, JSON.stringify(completed), 'EX', ttlSeconds);
  }

  async release(redisKey: string, requestHash: string): Promise<void> {
    if (!this.redis.isEnabled()) return;

    const client = this.redis.getClient();
    const raw = await client.get(redisKey);
    if (!raw) return;

    const record = parseRecord(raw);
    if (!record) return;
    if (record.requestHash !== requestHash) return;
    if (record.state !== 'in_progress') return;

    await client.del(redisKey);
  }

  private computeRequestHash(req: FastifyRequest, method: WriteMethod): string {
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
}
