import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyReply } from 'fastify';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { SKIP_ENVELOPE_KEY } from '../decorators/skip-envelope.decorator';

type ListEnvelopeCandidate = Record<string, unknown> & {
  items: unknown[];
  nextCursor?: unknown;
  limit?: unknown;
  hasMore?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isListEnvelopeCandidate(value: unknown): value is ListEnvelopeCandidate {
  return isRecord(value) && Array.isArray(value.items);
}

@Injectable()
export class ResponseEnvelopeInterceptor implements NestInterceptor<unknown, unknown> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const reply = http.getResponse<FastifyReply>();
    const handler = context.getHandler();
    const cls = context.getClass();
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_ENVELOPE_KEY, [handler, cls]);

    return next.handle().pipe(
      map((data: unknown) => {
        if (skip) return data;

        if (reply.statusCode === 204) return data;
        if (data === undefined || data === null) return data;
        if (typeof data === 'string' || Buffer.isBuffer(data)) return data;

        // Auto-list: { items, nextCursor?, limit? } -> { data, meta }
        if (isListEnvelopeCandidate(data)) {
          const { items, nextCursor, limit, hasMore, ...rest } = data;
          const normalizedNextCursor = typeof nextCursor === 'string' ? nextCursor : undefined;
          const normalizedLimit = typeof limit === 'number' ? limit : undefined;
          const normalizedHasMore =
            typeof hasMore === 'boolean' ? hasMore : normalizedNextCursor !== undefined;

          // Use object spread to avoid `Object.assign` triggering the `__proto__` setter.
          const meta: Record<string, unknown> = { ...rest };
          meta.hasMore = normalizedHasMore;
          if (normalizedNextCursor !== undefined) meta.nextCursor = normalizedNextCursor;
          if (normalizedLimit !== undefined) meta.limit = normalizedLimit;

          const envelope: {
            data: unknown[];
            meta?: Record<string, unknown>;
          } = {
            data: items,
          };
          if (Object.keys(meta).length) envelope.meta = meta;
          return envelope;
        }

        // Already enveloped
        if (isRecord(data) && ('data' in data || 'meta' in data)) {
          return data;
        }

        return { data };
      }),
    );
  }
}
