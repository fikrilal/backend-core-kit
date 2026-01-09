import { Module } from '@nestjs/common';
import { QueueProducer } from './queue.producer';
import { QueueWorkerFactory } from './queue.worker';

@Module({
  providers: [QueueProducer, QueueWorkerFactory],
  exports: [QueueProducer, QueueWorkerFactory],
})
export class QueueModule {}
