import { QueueProducer } from '../queue/queue.producer';
import type { PushService } from './push.service';
import { PUSH_QUEUE, PUSH_SEND_JOB } from './push.job';
import { PushJobs } from './push.jobs';
import { createPrototypeStub } from '../../../test/support/stubs';

describe('PushJobs', () => {
  it('is disabled when queue is disabled', () => {
    const queue = createPrototypeStub(QueueProducer, { isEnabled: () => false });
    const push: PushService = { isEnabled: () => true, sendToToken: jest.fn() };

    const jobs = new PushJobs(queue, push);
    expect(jobs.isEnabled()).toBe(false);
  });

  it('is disabled when push provider is disabled', () => {
    const queue = createPrototypeStub(QueueProducer, { isEnabled: () => true });
    const push: PushService = { isEnabled: () => false, sendToToken: jest.fn() };

    const jobs = new PushJobs(queue, push);
    expect(jobs.isEnabled()).toBe(false);
  });

  it('enqueues push.send when enabled', async () => {
    const enqueueMock = jest.fn().mockResolvedValue({ id: 'job-1' });
    const queue = createPrototypeStub(QueueProducer, {
      isEnabled: () => true,
      enqueue: (...args: unknown[]) => enqueueMock(...args),
    });

    const push: PushService = { isEnabled: () => true, sendToToken: jest.fn() };

    const jobs = new PushJobs(queue, push);

    const ok = await jobs.enqueueSendToSession({
      sessionId: 'session-1',
      notification: { title: 'Hi' },
      data: { action: 'PING' },
    });

    expect(ok).toBe(true);
    expect(enqueueMock).toHaveBeenCalledWith(
      PUSH_QUEUE,
      PUSH_SEND_JOB,
      expect.objectContaining({
        sessionId: 'session-1',
        notification: { title: 'Hi' },
        data: { action: 'PING' },
        requestedAt: expect.any(String),
      }),
    );
  });

  it('does not enqueue when disabled', async () => {
    const enqueueMock = jest.fn();
    const queue = createPrototypeStub(QueueProducer, {
      isEnabled: () => false,
      enqueue: (...args: unknown[]) => enqueueMock(...args),
    });

    const push: PushService = { isEnabled: () => true, sendToToken: jest.fn() };

    const jobs = new PushJobs(queue, push);
    const ok = await jobs.enqueueSendToSession({ sessionId: 'session-1' });

    expect(ok).toBe(false);
    expect(enqueueMock).not.toHaveBeenCalled();
  });
});
