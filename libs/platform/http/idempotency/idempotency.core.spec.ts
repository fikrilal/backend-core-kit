import type { FastifyRequest } from 'fastify';
import { computeRequestHash, createCompletedRecord, parseRecord } from './idempotency.core';

function makeRequest(input: {
  method?: string;
  url?: string;
  query?: unknown;
  body?: unknown;
}): FastifyRequest {
  return {
    method: input.method ?? 'POST',
    url: input.url ?? '/v1/resource?x=1',
    query: input.query ?? {},
    body: input.body,
    headers: {},
  } as unknown as FastifyRequest;
}

describe('idempotency.core', () => {
  it('hashes semantically equivalent payloads to the same request hash', () => {
    const reqA = makeRequest({
      query: { b: 2, a: 1 },
      body: { z: 'last', a: 'first' },
    });
    const reqB = makeRequest({
      query: { a: 1, b: 2 },
      body: { a: 'first', z: 'last' },
    });

    expect(computeRequestHash(reqA, 'POST')).toBe(computeRequestHash(reqB, 'POST'));
  });

  it('parses only valid stored records', () => {
    expect(parseRecord('{bad-json')).toBeUndefined();
    expect(parseRecord(JSON.stringify({ v: 1, state: 'unknown' }))).toBeUndefined();
    expect(
      parseRecord(
        JSON.stringify({
          v: 1,
          state: 'completed',
          requestHash: 'h-1',
          status: 201,
          hasBody: true,
          body: { ok: true },
          completedAt: Date.now(),
        }),
      ),
    ).toMatchObject({ state: 'completed', requestHash: 'h-1' });
  });

  it('omits response body for 204 completed records', () => {
    const completed = createCompletedRecord({
      requestHash: 'hash-204',
      status: 204,
      body: { ignored: true },
      headers: {},
    });

    expect(completed.hasBody).toBe(false);
    expect('body' in completed).toBe(false);
  });
});
