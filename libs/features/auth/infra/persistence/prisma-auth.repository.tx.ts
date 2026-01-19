import { Prisma, type PrismaClient } from '@prisma/client';

export function isRetryableTransactionError(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return err.code === 'P2034' || err.code === '40001' || err.code === '40P01';
  }

  if (err instanceof Error) {
    // Prisma 7 adapter errors surfaced directly from the driver.
    if (err.name === 'DriverAdapterError' && err.message === 'TransactionWriteConflict') {
      return true;
    }

    // Best-effort fallbacks for other transient transaction errors.
    if (err.message.includes('TransactionWriteConflict')) return true;
    if (err.message.toLowerCase().includes('could not serialize access')) return true;
    if (err.message.toLowerCase().includes('deadlock detected')) return true;
  }

  return false;
}

export async function withSerializableRetry<T>(
  client: PrismaClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: Readonly<{
    maxAttempts?: number;
    shouldRetry?: (err: unknown) => boolean;
  }>,
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const shouldRetry = options?.shouldRetry ?? isRetryableTransactionError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await client.$transaction(fn, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (err: unknown) {
      if (attempt < maxAttempts && shouldRetry(err)) continue;
      throw err;
    }
  }

  throw new Error('Unexpected: exhausted transaction retries');
}
