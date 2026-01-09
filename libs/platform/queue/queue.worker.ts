import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Worker, type WorkerOptions, type Processor } from 'bullmq';
import type { JsonObject } from './json.types';
import type { QueueName } from './queue-name';

@Injectable()
export class QueueWorkerFactory implements OnModuleDestroy {
  private readonly workers = new Map<QueueName, Worker>();
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

  createWorker<TData extends JsonObject, TResult = unknown>(
    queueName: QueueName,
    processor: Processor<TData, TResult, string>,
    options: Omit<WorkerOptions, 'connection'> = {},
  ): Worker<TData, TResult, string> {
    if (!this.redisUrl) {
      throw new Error('REDIS_URL is not configured');
    }

    const existing = this.workers.get(queueName);
    if (existing) {
      throw new Error(
        `Worker for queue "${queueName}" is already registered in this process. Scale via multiple worker processes instead.`,
      );
    }

    const worker = new Worker<TData, TResult, string>(queueName, processor, {
      ...options,
      connection: { url: this.redisUrl },
    });

    this.workers.set(queueName, worker);
    return worker;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.workers.values()].map((w) => w.close()));
    this.workers.clear();
  }
}
