import { Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { ErrorCode } from '../errors/error-codes';
import { ProblemException } from '../errors/problem.exception';
import { RedisService } from '../../redis/redis.service';
import type { IdempotencyOptions } from './idempotency.decorator';
import {
  asNonEmptyString,
  type CompletedRecord,
  computeRequestHash,
  createCompletedRecord,
  createInProgressRecord,
  getIdempotencyKeyHeader,
  hashScopeKey,
  isWriteMethod,
  MAX_REPLAY_RECORD_CHARS,
  parseRecord,
  sleep,
} from './idempotency.core';

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
    const scopeHash = hashScopeKey(scopeKey);
    const redisKey = `idempotency:v1:${userId}:${scopeHash}:${header}`;

    const requestHash = computeRequestHash(req, method);
    const ttlSeconds = options.ttlSeconds ?? 60 * 60 * 24;
    const waitMs = options.waitMs ?? 2000;
    const lockTtlSeconds = options.lockTtlSeconds ?? 30;

    const client = this.redis.getClient();
    const inProgress = createInProgressRecord(requestHash);

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

    const completed = createCompletedRecord({
      requestHash,
      status,
      body,
      headers,
    });

    const serialized = JSON.stringify(completed);
    if (serialized.length > MAX_REPLAY_RECORD_CHARS) {
      // Fail safe: don't attempt to cache a large body in Redis (idempotency replay is not supported).
      await this.release(redisKey, requestHash);
      return;
    }

    const client = this.redis.getClient();
    await client.set(redisKey, serialized, 'EX', ttlSeconds);
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
}
