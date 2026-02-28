type BestEffortContext = Readonly<Record<string, unknown>>;

type BestEffortLogger = Readonly<{
  error(payload: Record<string, unknown>, message: string): void;
}>;

type BestEffortMetricHook = (params: {
  operation: string;
  error: unknown;
  context: BestEffortContext;
}) => void;

type RunBestEffortInput = Readonly<{
  logger: BestEffortLogger;
  operation: string;
  run: () => Promise<unknown>;
  context?: BestEffortContext;
  onFailureMetric?: BestEffortMetricHook;
}>;

export async function runBestEffort(input: RunBestEffortInput): Promise<void> {
  try {
    await input.run();
  } catch (error: unknown) {
    const context = input.context ?? {};

    try {
      input.onFailureMetric?.({
        operation: input.operation,
        error,
        context,
      });
    } catch (metricError: unknown) {
      input.logger.error(
        {
          err: metricError,
          operation: input.operation,
          ...context,
        },
        'Best-effort metric hook failed',
      );
    }

    input.logger.error(
      {
        err: error,
        operation: input.operation,
        ...context,
      },
      'Best-effort side effect failed',
    );
  }
}
