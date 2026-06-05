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
import { createConfigService } from '../../../test/support/stubs';
import { jobName } from './job-name';
import { queueName } from './queue-name';
import { QueueProducer } from './queue.producer';
import { QueueWorkerFactory } from './queue.worker';
import { DEFAULT_WORKER_OPTIONS } from './queue.defaults';

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getWorkerCtor(): jest.Mock {
  const workerCtor = Reflect.get(jest.requireMock('bullmq'), 'Worker');
  if (!jest.isMockFunction(workerCtor)) {
    throw new Error('Expected bullmq Worker mock');
  }

  return workerCtor;
}

function expectRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`Expected ${label} object`);
  }

  return value;
}

function isSpanContext(value: unknown): value is SpanContext {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.traceId === 'string' &&
    value.traceId.trim() !== '' &&
    typeof value.spanId === 'string' &&
    value.spanId.trim() !== ''
  );
}

function expectSpanContext(value: unknown): asserts value is SpanContext {
  if (!isSpanContext(value)) {
    throw new Error('Expected SpanContext.traceId');
  }
}

type FinishedSpanLike = Readonly<{
  name: string;
  spanContext: () => SpanContext;
  parentSpanContext?: SpanContext;
}>;

function isFinishedSpanLike(value: unknown): value is FinishedSpanLike {
  return (
    isRecord(value) &&
    typeof value.name === 'string' &&
    typeof value.spanContext === 'function' &&
    (value.parentSpanContext === undefined || isSpanContext(value.parentSpanContext))
  );
}

function expectFinishedSpan(value: unknown, name: string): FinishedSpanLike {
  if (!isFinishedSpanLike(value)) {
    throw new Error(`Expected finished span "${name}"`);
  }

  return value;
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

    const producer = new QueueProducer(createConfigService({ REDIS_URL: 'redis://unused' }));
    const workers = new QueueWorkerFactory(createConfigService({ REDIS_URL: 'redis://unused' }));

    const tracer = otelTrace.getTracer('test');
    const httpSpan = tracer.startSpan('http.request', { kind: SpanKind.SERVER });

    const queue = queueName('system');
    const name = jobName('system.smoke');
    const data = { runId: '1', requestedAt: new Date().toISOString() };

    await otelContext.with(otelTrace.setSpan(otelContext.active(), httpSpan), async () => {
      await producer.enqueue(queue, name, data, { jobId: 'job-1' });
    });
    httpSpan.end();

    expect(addCalls).toHaveLength(1);
    const payload = expectRecord(addCalls[0]?.data, 'job payload');
    expect(payload.__meta).toBeDefined();

    const meta = expectRecord(payload.__meta, 'job payload.__meta');
    const otel = expectRecord(meta.otel, 'job payload.__meta.otel');
    expect(typeof otel.traceparent).toBe('string');
    expect(String(otel.traceparent)).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/);

    // Register a worker and execute its wrapped processor with the enqueued job payload.
    workers.createWorker(queue, async () => ({ ok: true }));
    expect(getWorkerCtor()).toHaveBeenCalledWith(
      queue,
      expect.any(Function),
      expect.objectContaining(DEFAULT_WORKER_OPTIONS),
    );

    const worker = expectRecord(createdWorkers[0], 'created worker');
    expect(worker.__processor).toBeDefined();
    const processor = Reflect.get(worker, '__processor');
    if (typeof processor !== 'function') {
      throw new Error('Expected worker processor function');
    }

    await processor(
      {
        id: 'job-1',
        name: String(name),
        data: payload,
        attemptsMade: 0,
        opts: { attempts: 1 },
      },
      'token',
    );

    await producer.onModuleDestroy();
    await workers.onModuleDestroy();

    const spans = exporter.getFinishedSpans();

    const http = expectFinishedSpan(getSpanByName(spans, 'http.request'), 'http.request');
    const enqueue = expectFinishedSpan(getSpanByName(spans, 'queue.enqueue'), 'queue.enqueue');
    const process = expectFinishedSpan(getSpanByName(spans, 'queue.process'), 'queue.process');

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
