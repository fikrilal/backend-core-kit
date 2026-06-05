import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, type Job, type JobsOptions } from 'bullmq';
import {
  SpanKind,
  SpanStatusCode,
  context as otelContext,
  trace as otelTrace,
} from '@opentelemetry/api';
import { DEFAULT_JOB_OPTIONS } from './queue.defaults';
import type { QueueName } from './queue-name';
import type { JobName } from './job-name';
import type { JsonObject } from './json.types';
import { withJobOtelMeta } from './job-meta';
import { getActiveJobOtelMeta, QUEUE_TRACER, toOtelException } from './queue-otel';
import { buildQueueRedisConnection } from './queue-redis';
import type { RedisConnectionOptions } from '../config/redis-connection';

@Injectable()
export class QueueProducer implements OnModuleDestroy {
  private readonly queues = new Map<QueueName, Queue<JsonObject, JsonObject, string>>();
  private readonly redis?: RedisConnectionOptions;

  constructor(private readonly config: ConfigService) {
    this.redis = buildQueueRedisConnection(this.config);
  }

  isEnabled(): boolean {
    return this.redis !== undefined;
  }

  getQueue(name: QueueName): Queue<JsonObject, JsonObject, string> {
    if (!this.redis) {
      throw new Error('REDIS_URL is not configured');
    }

    const existing = this.queues.get(name);
    if (existing) return existing;

    const queue = new Queue<JsonObject, JsonObject, string>(name, {
      connection: this.redis,
      defaultJobOptions: DEFAULT_JOB_OPTIONS,
    });

    this.queues.set(name, queue);
    return queue;
  }

  async enqueue<TData extends JsonObject>(
    queueName: QueueName,
    name: JobName,
    data: TData,
    options: JobsOptions = {},
  ): Promise<Job<JsonObject, JsonObject, string>> {
    const queue = this.getQueue(queueName);

    const span = QUEUE_TRACER.startSpan('queue.enqueue', {
      kind: SpanKind.PRODUCER,
      attributes: {
        'app.queue.name': queueName,
        'app.job.name': name,
      },
    });

    const ctx = otelTrace.setSpan(otelContext.active(), span);

    try {
      const job = await otelContext.with(ctx, async () => {
        const otelMeta = getActiveJobOtelMeta();
        const payload: JsonObject = otelMeta ? withJobOtelMeta(data, otelMeta) : data;
        return queue.add(name, payload, options);
      });

      if (typeof job.id === 'string' && job.id.trim() !== '') {
        span.setAttribute('app.job.id', job.id);
      }

      return job;
    } catch (err) {
      span.recordException(toOtelException(err));
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      span.end();
    }
  }

  async removeJob(queueName: QueueName, jobId: string): Promise<boolean> {
    const queue = this.getQueue(queueName);
    const code = await queue.remove(jobId);
    return code === 1;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    this.queues.clear();
  }
}
