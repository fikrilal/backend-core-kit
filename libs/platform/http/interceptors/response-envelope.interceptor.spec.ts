import type { CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { createHttpExecutionContext } from '../../../../test/support/http';
import { createPrototypeStub } from '../../../../test/support/stubs';
import { ResponseEnvelopeInterceptor } from './response-envelope.interceptor';

function createContext(reply: object) {
  class Controller {
    handler(): void {}
  }

  return createHttpExecutionContext({
    handler: Controller.prototype.handler,
    cls: Controller,
    request: {},
    response: reply,
  });
}

function createCallHandler(value: unknown): CallHandler {
  return {
    handle: () => of(value),
  };
}

describe('ResponseEnvelopeInterceptor', () => {
  it('wraps list results as { data, meta } and merges extra fields into meta (no top-level extra)', async () => {
    const reflector = createPrototypeStub(Reflector, {
      getAllAndOverride: () => false,
    });

    const reply = { statusCode: 200 };
    const interceptor = new ResponseEnvelopeInterceptor(reflector);

    // JSON.parse ensures `__proto__` is an own data property (not a prototype mutation),
    // so we can validate the interceptor doesn't accidentally mutate `meta`'s prototype.
    const input = JSON.parse(
      '{"items":[{"id":1}],"limit":25,"hasMore":true,"nextCursor":"cursor-1","totalCount":123,"__proto__":{"polluted":true}}',
    );

    const result = await lastValueFrom(
      interceptor.intercept(createContext(reply), createCallHandler(input)),
    );

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
    const meta =
      typeof result === 'object' && result !== null ? Reflect.get(result, 'meta') : undefined;
    expect(meta).toBeDefined();
    if (!meta || typeof meta !== 'object') throw new Error('Expected result.meta to be defined');
    expect(Object.getPrototypeOf(meta)).toBe(Object.prototype);
    expect(Reflect.get(meta, 'polluted')).toBeUndefined();
  });
});
