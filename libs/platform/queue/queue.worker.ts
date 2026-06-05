import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, type WorkerOptions, type Processor } from 'bullmq';
import {
  SpanKind,
  SpanStatusCode,
  context as otelContext,
  trace as otelTrace,
} from '@opentelemetry/api';
import type { JsonObject } from './json.types';
import type { QueueName } from './queue-name';
import { DEFAULT_WORKER_OPTIONS } from './queue.defaults';
import { extractJobContextFromData, QUEUE_TRACER, toOtelException } from './queue-otel';
import { buildQueueRedisConnection } from './queue-redis';
import type { RedisConnectionOptions } from '../config/redis-connection';

@Injectable()
export class QueueWorkerFactory implements OnModuleDestroy {
  private readonly workers = new Map<QueueName, Worker>();
  private readonly redis?: RedisConnectionOptions;

  constructor(private readonly config: ConfigService) {
    this.redis = buildQueueRedisConnection(this.config);
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

      const span = QUEUE_TRACER.startSpan(
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
      ...DEFAULT_WORKER_OPTIONS,
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
