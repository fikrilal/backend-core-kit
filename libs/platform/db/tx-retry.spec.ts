import { Prisma, type PrismaClient } from '@prisma/client';
import {
  isRetryableTransactionError,
  withSerializableRetry,
  withTransactionRetry,
} from './tx-retry';

type TxHandler = (
  fn: (tx: Prisma.TransactionClient) => Promise<unknown>,
  options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
) => Promise<unknown>;

function asPrismaClient(handler: TxHandler): PrismaClient {
  return {
    $transaction: handler,
  } as unknown as PrismaClient;
}

function makeKnownRequestError(code: string): Prisma.PrismaClientKnownRequestError {
  const err = Object.create(
    Prisma.PrismaClientKnownRequestError.prototype,
  ) as Prisma.PrismaClientKnownRequestError & { code: string };
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
    const client = asPrismaClient(async (fn, _options) => {
      attempts += 1;
      if (attempts === 1) throw new Error('deadlock detected');
      return await fn({} as Prisma.TransactionClient);
    });

    const result = await withTransactionRetry(client, async () => 'ok', { maxAttempts: 3 });

    expect(result).toBe('ok');
    expect(attempts).toBe(2);
  });

  it('does not retry non-retryable errors', async () => {
    let attempts = 0;
    const err = new Error('unique constraint');
    const client = asPrismaClient(async () => {
      attempts += 1;
      throw err;
    });

    await expect(withTransactionRetry(client, async () => 'ok')).rejects.toBe(err);
    expect(attempts).toBe(1);
  });

  it('uses provided isolation level', async () => {
    const optionsSeen: Array<{ isolationLevel?: Prisma.TransactionIsolationLevel }> = [];
    const client = asPrismaClient(async (fn, options) => {
      optionsSeen.push(options ?? {});
      return await fn({} as Prisma.TransactionClient);
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
    const client = asPrismaClient(async (fn, options) => {
      optionsSeen.push(options ?? {});
      return await fn({} as Prisma.TransactionClient);
    });

    await withSerializableRetry(client, async () => 'ok');

    expect(optionsSeen).toEqual([
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    ]);
  });
});
