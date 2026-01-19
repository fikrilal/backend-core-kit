import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { FastifyReply } from 'fastify';
import { lastValueFrom, of } from 'rxjs';
import { ResponseEnvelopeInterceptor } from './response-envelope.interceptor';

function createContext(reply: FastifyReply): ExecutionContext {
  return {
    switchToHttp: () => ({
      getResponse: () => reply,
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

function createCallHandler(value: unknown): CallHandler {
  return {
    handle: () => of(value),
  };
}

describe('ResponseEnvelopeInterceptor', () => {
  it('wraps list results as { data, meta } and merges extra fields into meta (no top-level extra)', async () => {
    const reflector = {
      getAllAndOverride: () => false,
    } as unknown as Reflector;

    const reply = { statusCode: 200 } as unknown as FastifyReply;
    const interceptor = new ResponseEnvelopeInterceptor(reflector);

    // JSON.parse ensures `__proto__` is an own data property (not a prototype mutation),
    // so we can validate the interceptor doesn't accidentally mutate `meta`'s prototype.
    const input = JSON.parse(
      '{"items":[{"id":1}],"limit":25,"hasMore":true,"nextCursor":"cursor-1","totalCount":123,"__proto__":{"polluted":true}}',
    ) as unknown as Record<string, unknown>;

    const result = (await lastValueFrom(
      interceptor.intercept(createContext(reply), createCallHandler(input)),
    )) as { data: unknown; meta?: Record<string, unknown> };

    expect(result).toMatchObject({
      data: [{ id: 1 }],
      meta: {
        totalCount: 123,
        hasMore: true,
        nextCursor: 'cursor-1',
        limit: 25,
      },
    });
    expect(result).not.toHaveProperty('extra');
    const meta = result.meta;
    expect(meta).toBeDefined();
    if (!meta) throw new Error('Expected result.meta to be defined');
    expect(Object.getPrototypeOf(meta)).toBe(Object.prototype);
    expect(meta.polluted).toBeUndefined();
  });
});
