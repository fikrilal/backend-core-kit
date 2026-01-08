import { createApiApp } from '../apps/api/src/bootstrap';
import { buildOpenApiDocument, setupSwaggerUi } from '../apps/api/src/openapi';
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
  });
});

describe('Swagger UI (e2e)', () => {
  let app: Awaited<ReturnType<typeof createApiApp>>;
  let baseUrl: string;
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSwaggerEnabled = process.env.SWAGGER_UI_ENABLED;

  beforeAll(async () => {
    process.env.NODE_ENV = 'development';
    process.env.SWAGGER_UI_ENABLED = 'true';

    app = await createApiApp();
    const document = buildOpenApiDocument(app);
    setupSwaggerUi(app, document);

    await app.listen({ port: 0, host: '127.0.0.1' });
    baseUrl = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    if (originalSwaggerEnabled === undefined) {
      delete process.env.SWAGGER_UI_ENABLED;
    } else {
      process.env.SWAGGER_UI_ENABLED = originalSwaggerEnabled;
    }
  });

  it('GET /docs serves Swagger UI', async () => {
    const res = await request(baseUrl).get('/docs').expect(200);
    expect(res.headers['content-type']).toContain('text/html');
  });

  it('GET /docs-yaml serves the OpenAPI YAML document', async () => {
    const res = await request(baseUrl).get('/docs-yaml').expect(200);
    expect(res.text).toContain('openapi:');
    expect(res.text).toContain('/health:');
  });
});
