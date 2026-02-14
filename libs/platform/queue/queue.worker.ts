import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, type WorkerOptions, type Processor } from 'bullmq';
import {
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  context as otelContext,
  defaultTextMapGetter,
  propagation as otelPropagation,
  trace as otelTrace,
  type Context,
  type Exception,
} from '@opentelemetry/api';
import type { JsonObject } from './json.types';
import type { QueueName } from './queue-name';
import { getJobOtelMeta } from './job-meta';
import {
  buildRedisConnectionOptions,
  type RedisConnectionOptions,
} from '../config/redis-connection';

type OtelCarrier = Record<string, string>;

const tracer = otelTrace.getTracer('platform.queue');

function toOtelException(err: unknown): Exception {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }

  return String(err);
}

function extractJobContextFromData(data: unknown): Context {
  const meta = getJobOtelMeta(data);
  if (!meta) return ROOT_CONTEXT;

  const carrier: OtelCarrier = { traceparent: meta.traceparent };
  if (meta.tracestate) carrier.tracestate = meta.tracestate;

  return otelPropagation.extract(ROOT_CONTEXT, carrier, defaultTextMapGetter);
}

@Injectable()
export class QueueWorkerFactory implements OnModuleDestroy {
  private readonly workers = new Map<QueueName, Worker>();
  private readonly redis?: RedisConnectionOptions;

  constructor(private readonly config: ConfigService) {
    this.redis = buildRedisConnectionOptions({
      redisUrl: this.config.get<string>('REDIS_URL'),
      tlsRejectUnauthorized: this.config.get<boolean>('REDIS_TLS_REJECT_UNAUTHORIZED') ?? true,
    });
  }

  isEnabled(): boolean {
    return this.redis !== undefined;
  }

  createWorker<TData extends JsonObject, TResult = unknown>(
    queueName: QueueName,
    processor: Processor<TData, TResult, string>,
    options: Omit<WorkerOptions, 'connection'> = {},
  ): Worker<TData, TResult, string> {
    if (!this.redis) {
      throw new Error('REDIS_URL is not configured');
    }

    const existing = this.workers.get(queueName);
    if (existing) {
      throw new Error(
        `Worker for queue "${queueName}" is already registered in this process. Scale via multiple worker processes instead.`,
      );
    }

    const wrappedProcessor: Processor<TData, TResult, string> = async (job, token) => {
      const parentContext = extractJobContextFromData(job.data);

      const span = tracer.startSpan(
        'queue.process',
        {
          kind: SpanKind.CONSUMER,
          attributes: {
            'app.queue.name': queueName,
            'app.job.name': job.name,
            ...(typeof job.id === 'string' && job.id.trim() !== '' ? { 'app.job.id': job.id } : {}),
            'app.job.attempt': job.attemptsMade,
            ...(typeof job.opts.attempts === 'number'
              ? { 'app.job.attempts': job.opts.attempts }
              : {}),
          },
        },
        parentContext,
      );

      const spanContext = otelTrace.setSpan(parentContext, span);
      try {
        return await otelContext.with(spanContext, async () => processor(job, token));
      } catch (err) {
        span.recordException(toOtelException(err));
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw err;
      } finally {
        span.end();
      }
    };

    const worker = new Worker<TData, TResult, string>(queueName, wrappedProcessor, {
      ...options,
      connection: this.redis,
    });

    this.workers.set(queueName, worker);
    return worker;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.workers.values()].map((w) => w.close()));
    this.workers.clear();
  }
}
