import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, type Job, type JobsOptions } from 'bullmq';
import { DEFAULT_JOB_OPTIONS } from './queue.defaults';
import type { QueueName } from './queue-name';
import type { JobName } from './job-name';
import type { JsonObject } from './json.types';

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
    const job = await queue.add(name, data, options);
    return job as Job<TData>;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    this.queues.clear();
  }
}
