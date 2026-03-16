import { randomUUID } from 'crypto';
import type { AuthPrincipal } from '../libs/platform/auth/auth.types';
import { ErrorCode } from '../libs/platform/http/errors/error-codes';
import { ProblemException } from '../libs/platform/http/errors/problem.exception';
import { IdempotencyService } from '../libs/platform/http/idempotency/idempotency.service';
import { RedisService } from '../libs/platform/redis/redis.service';
import { createConfigService } from './support/stubs';

const redisUrl = process.env.REDIS_URL?.trim();
const skipDepsTests = process.env.SKIP_DEPS_TESTS === 'true';
const shouldSkip = skipDepsTests || !redisUrl;

type RequestLike = {
  method: string;
  url: string;
  headers: Record<string, string>;
  query: Record<string, unknown>;
  body: Record<string, unknown>;
  principal: AuthPrincipal;
};

async function beginWithRequest(
  service: IdempotencyService,
  req: RequestLike,
  options: Record<string, unknown>,
  routeName: string,
) {
  return await Reflect.apply(service.begin, service, [req, options, routeName]);
}

function expectProblem(err: unknown, status: number, code: string): void {
  if (!(err instanceof ProblemException)) {
    throw new Error(`Expected ProblemException, got: ${String(err)}`);
  }
  expect(err.getStatus()).toBe(status);
  const body = err.getResponse();
  expect(body).toMatchObject({ code });
}

(shouldSkip ? describe.skip : describe)('IdempotencyService (int)', () => {
  let redis: RedisService;
  let idempotency: IdempotencyService;
  const keysToCleanup: string[] = [];

  beforeAll(async () => {
    if (!redisUrl) throw new Error('REDIS_URL must be set when IdempotencyService (int) runs');

    redis = new RedisService(createConfigService({ NODE_ENV: 'test', REDIS_URL: redisUrl }));
    await redis.ping();
    idempotency = new IdempotencyService(redis);
  });

  afterEach(async () => {
    if (!redis.isEnabled()) return;
    const client = redis.getClient();
    while (keysToCleanup.length) {
      const key = keysToCleanup.pop();
      if (key) await client.del(key);
    }
  });

  afterAll(async () => {
    await redis.onModuleDestroy();
  });

  it('acquires, completes, and replays the cached response for the same Idempotency-Key', async () => {
    const principal: AuthPrincipal = {
      userId: `user-${randomUUID()}`,
      sessionId: `session-${randomUUID()}`,
      emailVerified: false,
      roles: ['USER'],
    };

    const req = {
      method: 'POST',
      url: '/v1/me',
      headers: { 'idempotency-key': `key-${randomUUID()}` },
      query: { a: '1' },
      body: { hello: 'world' },
      principal,
    };

    const first = await beginWithRequest(idempotency, req, {}, 'Users.MePatch');
    expect(first.kind).toBe('acquired');
    if (first.kind !== 'acquired') return;
    keysToCleanup.push(first.redisKey);

    await idempotency.complete(first.redisKey, first.requestHash, 200, { ok: true }, {}, 60);

    const second = await beginWithRequest(idempotency, req, {}, 'Users.MePatch');
    expect(second.kind).toBe('replay');
    if (second.kind !== 'replay') return;

    expect(second.record.status).toBe(200);
    expect(second.record.hasBody).toBe(true);
    expect(second.record.body).toEqual({ ok: true });
  });

  it('rejects Idempotency-Key reuse with a different request payload', async () => {
    const principal: AuthPrincipal = {
      userId: `user-${randomUUID()}`,
      sessionId: `session-${randomUUID()}`,
      emailVerified: false,
      roles: ['USER'],
    };
    const idemKey = `key-${randomUUID()}`;

    const reqA = {
      method: 'POST',
      url: '/v1/me',
      headers: { 'idempotency-key': idemKey },
      query: {},
      body: { a: 1 },
      principal,
    };

    const reqB = {
      method: 'POST',
      url: '/v1/me',
      headers: { 'idempotency-key': idemKey },
      query: {},
      body: { a: 2 },
      principal,
    };

    const first = await beginWithRequest(idempotency, reqA, {}, 'Users.MePatch');
    expect(first.kind).toBe('acquired');
    if (first.kind !== 'acquired') return;
    keysToCleanup.push(first.redisKey);

    let err: unknown;
    try {
      await beginWithRequest(idempotency, reqB, {}, 'Users.MePatch');
    } catch (caught: unknown) {
      err = caught;
    }
    expectProblem(err, 409, ErrorCode.CONFLICT);
  });

  it('waits for completion when a request is already in progress', async () => {
    const principal: AuthPrincipal = {
      userId: `user-${randomUUID()}`,
      sessionId: `session-${randomUUID()}`,
      emailVerified: false,
      roles: ['USER'],
    };

    const req = {
      method: 'POST',
      url: '/v1/me',
      headers: { 'idempotency-key': `key-${randomUUID()}` },
      query: {},
      body: { hello: 'world' },
      principal,
    };

    const first = await beginWithRequest(idempotency, req, { waitMs: 500 }, 'Users.MePatch');
    expect(first.kind).toBe('acquired');
    if (first.kind !== 'acquired') return;
    keysToCleanup.push(first.redisKey);

    const second = await beginWithRequest(idempotency, req, { waitMs: 500 }, 'Users.MePatch');
    expect(second.kind).toBe('in_progress');
    if (second.kind !== 'in_progress') return;

    const completion = (async () => {
      await new Promise((r) => setTimeout(r, 75));
      await idempotency.complete(first.redisKey, first.requestHash, 200, { ok: true }, {}, 60);
    })();

    const record = await idempotency.waitForCompletion(
      second.redisKey,
      second.requestHash,
      second.waitMs,
    );
    await completion;

    expect(record).toBeDefined();
    expect(record?.status).toBe(200);
  });

  it('does not cache errors; error completion releases the in-progress lock', async () => {
    const principal: AuthPrincipal = {
      userId: `user-${randomUUID()}`,
      sessionId: `session-${randomUUID()}`,
      emailVerified: false,
      roles: ['USER'],
    };

    const req = {
      method: 'POST',
      url: '/v1/me',
      headers: { 'idempotency-key': `key-${randomUUID()}` },
      query: {},
      body: { hello: 'world' },
      principal,
    };

    const first = await beginWithRequest(idempotency, req, {}, 'Users.MePatch');
    expect(first.kind).toBe('acquired');
    if (first.kind !== 'acquired') return;
    keysToCleanup.push(first.redisKey);

    await idempotency.complete(first.redisKey, first.requestHash, 500, { error: true }, {}, 60);

    const second = await beginWithRequest(idempotency, req, {}, 'Users.MePatch');
    expect(second.kind).toBe('acquired');
    if (second.kind !== 'acquired') return;

    keysToCleanup.push(second.redisKey);
  });
});
