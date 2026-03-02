import { Prisma, type PrismaClient } from '@prisma/client';

type RetryBackoffOptions = Readonly<{
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitterRatio?: number;
  sleep?: (delayMs: number) => Promise<void>;
  random?: () => number;
}>;

type TxRetryOptions = Readonly<{
  maxAttempts?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
  shouldRetry?: (err: unknown) => boolean;
  backoff?: RetryBackoffOptions;
}>;

const DEFAULT_RETRY_BASE_DELAY_MS = 25;
const DEFAULT_RETRY_MAX_DELAY_MS = 250;
const DEFAULT_RETRY_JITTER_RATIO = 0.2;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function getBackoffSettings(
  options: RetryBackoffOptions | undefined,
): Required<RetryBackoffOptions> {
  const baseDelayMs = Math.max(0, options?.baseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS);
  const maxDelayMs = Math.max(baseDelayMs, options?.maxDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS);
  const jitterRatio = clamp(options?.jitterRatio ?? DEFAULT_RETRY_JITTER_RATIO, 0, 1);
  const sleep =
    options?.sleep ??
    (async (delayMs: number) => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, delayMs);
      });
    });
  const random = options?.random ?? Math.random;

  return { baseDelayMs, maxDelayMs, jitterRatio, sleep, random };
}

function calculateBackoffDelayMs(attempt: number, settings: Required<RetryBackoffOptions>): number {
  if (settings.baseDelayMs <= 0) return 0;

  const exponentialDelay = Math.min(settings.maxDelayMs, settings.baseDelayMs * 2 ** (attempt - 1));
  if (settings.jitterRatio <= 0) return exponentialDelay;

  const floor = exponentialDelay * (1 - settings.jitterRatio);
  const jittered = floor + settings.random() * (exponentialDelay - floor);
  return Math.max(0, Math.round(jittered));
}

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

export async function withTransactionRetry<T>(
  client: PrismaClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: TxRetryOptions,
): Promise<T> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const shouldRetry = options?.shouldRetry ?? isRetryableTransactionError;
  const backoffSettings = getBackoffSettings(options?.backoff);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const txOptions =
        options?.isolationLevel !== undefined
          ? { isolationLevel: options.isolationLevel }
          : undefined;
      return await client.$transaction(fn, txOptions);
    } catch (err: unknown) {
      if (attempt < maxAttempts && shouldRetry(err)) {
        const delayMs = calculateBackoffDelayMs(attempt, backoffSettings);
        if (delayMs > 0) {
          await backoffSettings.sleep(delayMs);
        }
        continue;
      }
      throw err;
    }
  }

  throw new Error('Unexpected: exhausted transaction retries');
}

export async function withSerializableRetry<T>(
  client: PrismaClient,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options?: Readonly<{
    maxAttempts?: number;
    shouldRetry?: (err: unknown) => boolean;
    backoff?: RetryBackoffOptions;
  }>,
): Promise<T> {
  return await withTransactionRetry(client, fn, {
    maxAttempts: options?.maxAttempts,
    shouldRetry: options?.shouldRetry,
    backoff: options?.backoff,
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  });
}
