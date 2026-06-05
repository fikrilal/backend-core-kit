import { Prisma, PrismaClient, type PrismaClient as PrismaClientType } from '@prisma/client';
import { createPrototypeStub } from '../../../test/support/stubs';
import {
  isRetryableTransactionError,
  withSerializableRetry,
  withTransactionRetry,
} from './tx-retry';

type TxHandler = (
  fn: (tx: Prisma.TransactionClient) => Promise<unknown>,
  options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
) => Promise<unknown>;

function createPrismaClient(handler: TxHandler): PrismaClientType {
  return createPrototypeStub(PrismaClient, {
    $transaction: handler,
  });
}

function makeKnownRequestError(code: string) {
  const err = Object.create(Prisma.PrismaClientKnownRequestError.prototype);
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) {
    throw new Error('Expected PrismaClientKnownRequestError prototype');
  }
  err.code = code;
  return err;
}

describe('tx-retry', () => {
  it('classifies Prisma retryable transaction codes', () => {
    expect(isRetryableTransactionError(makeKnownRequestError('P2034'))).toBe(true);
    expect(isRetryableTransactionError(makeKnownRequestError('40001'))).toBe(true);
    expect(isRetryableTransactionError(makeKnownRequestError('40P01'))).toBe(true);
    expect(isRetryableTransactionError(makeKnownRequestError('P2002'))).toBe(false);
  });

  it('classifies retryable driver-adapter errors by name/message', () => {
    const err = new Error('TransactionWriteConflict');
    err.name = 'DriverAdapterError';
    expect(isRetryableTransactionError(err)).toBe(true);
  });

  it('retries transaction when classifier marks error retryable', async () => {
    let attempts = 0;
    const client = createPrismaClient(async (fn, _options) => {
      attempts += 1;
      if (attempts === 1) throw new Error('deadlock detected');
      return await fn(createPrototypeStub(PrismaClient, {}));
    });

    const result = await withTransactionRetry(client, async () => 'ok', { maxAttempts: 3 });

    expect(result).toBe('ok');
    expect(attempts).toBe(2);
  });

  it('applies exponential backoff between retry attempts', async () => {
    let attempts = 0;
    const sleepCalls: number[] = [];
    const client = createPrismaClient(async (fn) => {
      attempts += 1;
      if (attempts < 4) throw new Error('deadlock detected');
      return await fn(createPrototypeStub(PrismaClient, {}));
    });

    const result = await withTransactionRetry(client, async () => 'ok', {
      maxAttempts: 4,
      shouldRetry: () => true,
      backoff: {
        baseDelayMs: 10,
        maxDelayMs: 100,
        jitterRatio: 0,
        sleep: async (delayMs) => {
          sleepCalls.push(delayMs);
        },
      },
    });

    expect(result).toBe('ok');
    expect(attempts).toBe(4);
    expect(sleepCalls).toEqual([10, 20, 40]);
  });

  it('caps exponential backoff at max delay and applies jitter', async () => {
    let attempts = 0;
    const sleepCalls: number[] = [];
    const client = createPrismaClient(async (fn) => {
      attempts += 1;
      if (attempts < 4) throw new Error('deadlock detected');
      return await fn(createPrototypeStub(PrismaClient, {}));
    });

    await withTransactionRetry(client, async () => 'ok', {
      maxAttempts: 4,
      shouldRetry: () => true,
      backoff: {
        baseDelayMs: 80,
        maxDelayMs: 100,
        jitterRatio: 0.5,
        random: () => 0,
        sleep: async (delayMs) => {
          sleepCalls.push(delayMs);
        },
      },
    });

    // With jitterRatio=0.5 and random=0, delay floors to 50% of exponential value.
    expect(sleepCalls).toEqual([40, 50, 50]);
  });

  it('does not retry non-retryable errors', async () => {
    let attempts = 0;
    const err = new Error('unique constraint');
    const client = createPrismaClient(async () => {
      attempts += 1;
      throw err;
    });

    await expect(withTransactionRetry(client, async () => 'ok')).rejects.toBe(err);
    expect(attempts).toBe(1);
  });

  it('uses provided isolation level', async () => {
    const optionsSeen: Array<{ isolationLevel?: Prisma.TransactionIsolationLevel }> = [];
    const client = createPrismaClient(async (fn, options) => {
      optionsSeen.push(options ?? {});
      return await fn(createPrototypeStub(PrismaClient, {}));
    });

    await withTransactionRetry(client, async () => 'ok', {
      isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    });

    expect(optionsSeen).toEqual([
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    ]);
  });

  it('withSerializableRetry enforces serializable isolation level', async () => {
    const optionsSeen: Array<{ isolationLevel?: Prisma.TransactionIsolationLevel }> = [];
    const client = createPrismaClient(async (fn, options) => {
      optionsSeen.push(options ?? {});
      return await fn(createPrototypeStub(PrismaClient, {}));
    });

    await withSerializableRetry(client, async () => 'ok');

    expect(optionsSeen).toEqual([
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ]);
  });

  it('does not sleep when maxAttempts is 1', async () => {
    const err = new Error('deadlock detected');
    const sleep = jest.fn(async () => undefined);
    const client = createPrismaClient(async () => {
      throw err;
    });

    await expect(
      withTransactionRetry(client, async () => 'ok', {
        maxAttempts: 1,
        shouldRetry: () => true,
        backoff: { sleep },
      }),
    ).rejects.toBe(err);
    expect(sleep).not.toHaveBeenCalled();
  });
});
