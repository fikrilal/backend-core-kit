import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, type Job, type JobsOptions } from 'bullmq';
import {
  SpanKind,
  SpanStatusCode,
  context as otelContext,
  propagation as otelPropagation,
  trace as otelTrace,
  type Exception,
} from '@opentelemetry/api';
import { DEFAULT_JOB_OPTIONS } from './queue.defaults';
import type { QueueName } from './queue-name';
import type { JobName } from './job-name';
import type { JsonObject } from './json.types';
import { withJobOtelMeta, type JobOtelMeta } from './job-meta';

type OtelCarrier = Record<string, string>;

const tracer = otelTrace.getTracer('platform.queue');

function toOtelException(err: unknown): Exception {
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }

  return String(err);
}

function getActiveJobOtelMeta(): JobOtelMeta | undefined {
  const carrier: OtelCarrier = {};
  otelPropagation.inject(otelContext.active(), carrier, {
    set: (c, key, value) => {
      if (key === 'traceparent' || key === 'tracestate') {
        c[key] = value;
      }
    },
  });

  const traceparent = carrier.traceparent;
  if (!traceparent) return undefined;

  const tracestate = carrier.tracestate;
  return { traceparent, ...(tracestate ? { tracestate } : {}) };
}

@Injectable()
export class QueueProducer implements OnModuleDestroy {
  private readonly queues = new Map<QueueName, Queue>();
  private readonly redisUrl?: string;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    const redisUrl = this.config.get<string>('REDIS_URL');
    this.redisUrl =
      typeof redisUrl === 'string' && redisUrl.trim() !== '' ? redisUrl.trim() : undefined;
    this.enabled = this.redisUrl !== undefined;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getQueue(name: QueueName): Queue {
    if (!this.redisUrl) {
      throw new Error('REDIS_URL is not configured');
    }

    const existing = this.queues.get(name);
    if (existing) return existing;

    const queue = new Queue(name, {
      connection: { url: this.redisUrl },
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
  ): Promise<Job<TData>> {
    const queue = this.getQueue(queueName);

    const span = tracer.startSpan('queue.enqueue', {
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
        const payload = otelMeta ? (withJobOtelMeta(data, otelMeta) as TData) : data;
        return queue.add(name, payload, options);
      });

      if (typeof job.id === 'string' && job.id.trim() !== '') {
        span.setAttribute('app.job.id', job.id);
      }

      return job as Job<TData>;
    } catch (err) {
      span.recordException(toOtelException(err));
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw err;
    } finally {
      span.end();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    this.queues.clear();
  }
}
