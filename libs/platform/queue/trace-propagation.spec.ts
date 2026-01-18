import type { ConfigService } from '@nestjs/config';
import {
  context as otelContext,
  propagation as otelPropagation,
  SpanKind,
  trace as otelTrace,
  type SpanContext,
} from '@opentelemetry/api';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { AsyncLocalStorageContextManager } from '@opentelemetry/context-async-hooks';
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from '@opentelemetry/sdk-trace-base';
import { jobName } from './job-name';
import type { JsonObject } from './json.types';
import { queueName } from './queue-name';
import { QueueProducer } from './queue.producer';
import { QueueWorkerFactory } from './queue.worker';

type AddCall = Readonly<{ name: string; data: unknown; options: unknown }>;

const addCalls: AddCall[] = [];
const createdWorkers: unknown[] = [];

jest.mock('bullmq', () => {
  return {
    Queue: jest.fn().mockImplementation(() => ({
      add: async (name: string, data: unknown, options: unknown) => {
        addCalls.push({ name, data, options });
        return { id: 'job-1' };
      },
      remove: async () => 1,
      close: async () => undefined,
    })),
    Worker: jest.fn().mockImplementation((_queueName: string, processor: unknown) => {
      const worker = { __processor: processor, close: async () => undefined };
      createdWorkers.push(worker);
      return worker;
    }),
  };
});

function stubConfig(values: Record<string, unknown>): ConfigService {
  return {
    get: <T = unknown>(key: string): T | undefined => values[key] as T | undefined,
  } as unknown as ConfigService;
}

function expectSpanContext(value: unknown): asserts value is SpanContext {
  if (!value || typeof value !== 'object') {
    throw new Error('Expected SpanContext object');
  }
  const sc = value as SpanContext;
  if (typeof sc.traceId !== 'string' || sc.traceId.trim() === '') {
    throw new Error('Expected SpanContext.traceId');
  }
  if (typeof sc.spanId !== 'string' || sc.spanId.trim() === '') {
    throw new Error('Expected SpanContext.spanId');
  }
}

function getSpanByName(spans: ReadonlyArray<{ name: string }>, name: string): unknown {
  return spans.find((s) => s.name === name);
}

describe('Queue trace propagation', () => {
  beforeEach(() => {
    addCalls.length = 0;
    createdWorkers.length = 0;
  });

  it('injects W3C trace context into job meta and links worker spans to the same trace', async () => {
    const exporter = new InMemorySpanExporter();
    const provider = new BasicTracerProvider({
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });

    otelContext.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
    otelPropagation.setGlobalPropagator(new W3CTraceContextPropagator());
    otelTrace.setGlobalTracerProvider(provider);

    const producer = new QueueProducer(stubConfig({ REDIS_URL: 'redis://unused' }));
    const workers = new QueueWorkerFactory(stubConfig({ REDIS_URL: 'redis://unused' }));

    const tracer = otelTrace.getTracer('test');
    const httpSpan = tracer.startSpan('http.request', { kind: SpanKind.SERVER });

    const queue = queueName('system');
    const name = jobName('system.smoke');
    const data: JsonObject = { runId: '1', requestedAt: new Date().toISOString() };

    await otelContext.with(otelTrace.setSpan(otelContext.active(), httpSpan), async () => {
      await producer.enqueue(queue, name, data, { jobId: 'job-1' });
    });
    httpSpan.end();

    expect(addCalls).toHaveLength(1);
    const payload = addCalls[0]?.data as Record<string, unknown> | undefined;
    expect(payload).toBeDefined();
    expect(payload?.__meta).toBeDefined();

    const meta = payload?.__meta as Record<string, unknown>;
    const otel = meta.otel as Record<string, unknown>;
    expect(typeof otel.traceparent).toBe('string');
    expect(String(otel.traceparent)).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/);

    // Register a worker and execute its wrapped processor with the enqueued job payload.
    workers.createWorker<JsonObject, unknown>(queue, async () => ({ ok: true }));

    const worker = createdWorkers[0] as { __processor?: unknown } | undefined;
    expect(worker?.__processor).toBeDefined();

    const processor = worker?.__processor as (job: unknown, token: string) => Promise<unknown>;

    await processor(
      {
        id: 'job-1',
        name: String(name),
        data: payload as JsonObject,
        attemptsMade: 0,
        opts: { attempts: 1 },
      } as unknown,
      'token',
    );

    await producer.onModuleDestroy();
    await workers.onModuleDestroy();

    const spans = exporter.getFinishedSpans();

    const http = getSpanByName(spans, 'http.request') as
      | { spanContext: () => SpanContext; parentSpanContext?: SpanContext }
      | undefined;
    const enqueue = getSpanByName(spans, 'queue.enqueue') as
      | { spanContext: () => SpanContext; parentSpanContext?: SpanContext }
      | undefined;
    const process = getSpanByName(spans, 'queue.process') as
      | { spanContext: () => SpanContext; parentSpanContext?: SpanContext }
      | undefined;

    expect(http).toBeDefined();
    expect(enqueue).toBeDefined();
    expect(process).toBeDefined();

    const httpCtx = http?.spanContext();
    const enqueueCtx = enqueue?.spanContext();
    const processCtx = process?.spanContext();

    expectSpanContext(httpCtx);
    expectSpanContext(enqueueCtx);
    expectSpanContext(processCtx);

    expect(enqueueCtx.traceId).toBe(httpCtx.traceId);
    expect(processCtx.traceId).toBe(httpCtx.traceId);

    expect(enqueue?.parentSpanContext?.spanId).toBe(httpCtx.spanId);
    expect(process?.parentSpanContext?.spanId).toBe(enqueueCtx.spanId);

    expect(String(otel.traceparent)).toContain(httpCtx.traceId);
    expect(String(otel.traceparent)).toContain(enqueueCtx.spanId);
  });
});
