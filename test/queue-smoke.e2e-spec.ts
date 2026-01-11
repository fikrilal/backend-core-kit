import { randomUUID } from 'crypto';
import { QueueEvents } from 'bullmq';
import request from 'supertest';
import { createApiApp } from '../apps/api/src/bootstrap';
import { createWorkerApp } from '../apps/worker/src/bootstrap';
import { jobName } from '../libs/platform/queue/job-name';
import { QueueProducer } from '../libs/platform/queue/queue.producer';
import { queueName } from '../libs/platform/queue/queue-name';

const databaseUrl = process.env.DATABASE_URL?.trim();
const redisUrl = process.env.REDIS_URL?.trim();

const hasDeps =
  typeof databaseUrl === 'string' &&
  databaseUrl !== '' &&
  typeof redisUrl === 'string' &&
  redisUrl !== '';

async function waitForReady(baseUrl: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastStatus: number | undefined;

  while (Date.now() < deadline) {
    const res = await request(baseUrl).get('/ready');
    lastStatus = res.status;
    if (res.status === 200) return;
    await new Promise((r) => setTimeout(r, 250));
  }

  throw new Error(`Timed out waiting for /ready (last status: ${lastStatus ?? 'unknown'})`);
}

(hasDeps ? describe : describe.skip)('Queue smoke (e2e)', () => {
  let apiApp: Awaited<ReturnType<typeof createApiApp>>;
  let workerApp: Awaited<ReturnType<typeof createWorkerApp>>;
  let workerBaseUrl: string;
  let producer: QueueProducer;

  beforeAll(async () => {
    workerApp = await createWorkerApp();
    await workerApp.listen({ port: 0, host: '127.0.0.1' });
    workerBaseUrl = await workerApp.getUrl();

    apiApp = await createApiApp();
    producer = apiApp.get(QueueProducer);

    await waitForReady(workerBaseUrl);
  });

  afterAll(async () => {
    await apiApp.close();
    await workerApp.close();
  });

  it('Worker health endpoints return ok', async () => {
    const healthRes = await request(workerBaseUrl).get('/health').expect(200);
    expect(healthRes.headers['x-request-id']).toBeDefined();
    expect(healthRes.body).toEqual({ status: 'ok' });

    const readyRes = await request(workerBaseUrl).get('/ready').expect(200);
    expect(readyRes.headers['x-request-id']).toBeDefined();
    expect(readyRes.body).toEqual({ status: 'ok' });
  });

  it('Processes system.smoke job and touches Postgres', async () => {
    if (!redisUrl) {
      throw new Error('REDIS_URL is required for this test');
    }

    const systemQueue = queueName('system');
    const smokeJob = jobName('system.smoke');

    const queueEvents = new QueueEvents(systemQueue, { connection: { url: redisUrl } });
    try {
      await queueEvents.waitUntilReady();
      const runId = randomUUID();
      const job = await producer.enqueue(
        systemQueue,
        smokeJob,
        { runId, requestedAt: new Date().toISOString() },
        { jobId: `system.smoke-${runId}` },
      );
      const result = await job.waitUntilFinished(queueEvents, 20_000);
      expect(result).toEqual({ ok: true, runId, db: 'ok' });
    } finally {
      await queueEvents.close();
    }
  });

  it('Retries system.smokeRetry with backoff, then succeeds', async () => {
    if (!redisUrl) {
      throw new Error('REDIS_URL is required for this test');
    }

    const systemQueue = queueName('system');
    const smokeRetryJob = jobName('system.smokeRetry');

    const queueEvents = new QueueEvents(systemQueue, { connection: { url: redisUrl } });
    try {
      await queueEvents.waitUntilReady();
      const runId = randomUUID();
      const startedAt = Date.now();
      const job = await producer.enqueue(
        systemQueue,
        smokeRetryJob,
        { runId, requestedAt: new Date().toISOString() },
        {
          jobId: `system.smokeRetry-${runId}`,
          attempts: 2,
          backoff: { type: 'fixed', delay: 750 },
        },
      );
      const result = await job.waitUntilFinished(queueEvents, 20_000);
      const elapsedMs = Date.now() - startedAt;

      expect(result).toEqual({ ok: true, runId, db: 'ok', attemptsMade: 1 });
      expect(elapsedMs).toBeGreaterThanOrEqual(600);
    } finally {
      await queueEvents.close();
    }
  });
});
