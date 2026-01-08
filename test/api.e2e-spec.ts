import { createApiApp } from '../apps/api/src/bootstrap';
import request from 'supertest';

describe('API baseline (e2e)', () => {
  let app: Awaited<ReturnType<typeof createApiApp>>;
  let baseUrl: string;

  beforeAll(async () => {
    app = await createApiApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns raw status and X-Request-Id', async () => {
    const res = await request(baseUrl).get('/health').expect(200);
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /ready returns raw status and X-Request-Id', async () => {
    const res = await request(baseUrl).get('/ready').expect(200);
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('Unknown route returns RFC7807 problem details with code and traceId', async () => {
    const res = await request(baseUrl).get('/does-not-exist').expect(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.body).toMatchObject({
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      code: 'NOT_FOUND',
    });
    expect(res.body.traceId).toBe(res.headers['x-request-id']);

    await app.close();
  });
});
