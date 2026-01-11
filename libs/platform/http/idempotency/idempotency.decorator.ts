import type { Reflector } from '@nestjs/core';
import { SetMetadata } from '@nestjs/common';

export type IdempotencyOptions = Readonly<{
  /**
   * Stable scope identifier for the operation (recommended: reuse operationId).
   * If omitted, defaults to `${ControllerClassName}.${handlerName}`.
   */
  scopeKey?: string;
  /**
   * Whether Idempotency-Key is required when the decorator is present.
   * Default: false.
   */
  required?: boolean;
  /**
   * How long a completed response is cached for replay (seconds).
   * Default: 86400 (24h).
   */
  ttlSeconds?: number;
  /**
   * If another request with the same key is in progress, wait up to this many milliseconds
   * for completion before returning IDEMPOTENCY_IN_PROGRESS.
   * Default: 2000ms.
   */
  waitMs?: number;
  /**
   * TTL for the in-progress lock (seconds). Keep this larger than expected handler time.
   * Default: 30s.
   */
  lockTtlSeconds?: number;
}>;

export const IDEMPOTENCY_OPTIONS_KEY = 'idempotencyOptions';

export function Idempotent(options: IdempotencyOptions = {}): ClassDecorator & MethodDecorator {
  return SetMetadata(IDEMPOTENCY_OPTIONS_KEY, options);
}

type ReflectorTarget = Parameters<Reflector['getAllAndOverride']>[1][number];

export function getIdempotencyOptions(
  reflector: Reflector,
  targets: ReadonlyArray<ReflectorTarget>,
): IdempotencyOptions | undefined {
  return reflector.getAllAndOverride<IdempotencyOptions>(IDEMPOTENCY_OPTIONS_KEY, [...targets]);
}
