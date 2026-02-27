import { runBestEffort } from './best-effort';

type LoggerError = (payload: Record<string, unknown>, message: string) => void;
type MetricHook = (params: {
  operation: string;
  error: unknown;
  context: Readonly<Record<string, unknown>>;
}) => void;

describe('runBestEffort', () => {
  it('executes side effect and does not log on success', async () => {
    const logger: { error: jest.MockedFunction<LoggerError> } = { error: jest.fn() };
    const run = jest.fn(async () => undefined);

    await runBestEffort({
      logger,
      operation: 'auth.enqueueVerificationEmail',
      run,
      context: { userId: 'user_1' },
    });

    expect(run).toHaveBeenCalledTimes(1);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('swallows errors, logs standardized shape, and invokes optional metric hook', async () => {
    const logger: { error: jest.MockedFunction<LoggerError> } = { error: jest.fn() };
    const failure = new Error('queue down');
    const onFailureMetric: jest.MockedFunction<MetricHook> = jest.fn();

    await runBestEffort({
      logger,
      operation: 'users.scheduleDeletionReminderEmail',
      run: async () => {
        throw failure;
      },
      context: { userId: 'user_2', sessionId: 'session_1' },
      onFailureMetric,
    });

    expect(onFailureMetric).toHaveBeenCalledWith({
      operation: 'users.scheduleDeletionReminderEmail',
      error: failure,
      context: { userId: 'user_2', sessionId: 'session_1' },
    });
    expect(logger.error).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith(
      {
        err: failure,
        operation: 'users.scheduleDeletionReminderEmail',
        userId: 'user_2',
        sessionId: 'session_1',
      },
      'Best-effort side effect failed',
    );
  });

  it('swallows metric hook failures and still logs the original side-effect failure', async () => {
    const logger: { error: jest.MockedFunction<LoggerError> } = { error: jest.fn() };
    const sideEffectFailure = new Error('queue down');
    const metricFailure = new Error('metrics unavailable');
    const onFailureMetric = jest.fn((_params: Parameters<MetricHook>[0]) => {
      throw metricFailure;
    });

    await expect(
      runBestEffort({
        logger,
        operation: 'users.scheduleDeletionReminderEmail',
        run: async () => {
          throw sideEffectFailure;
        },
        context: { userId: 'user_2' },
        onFailureMetric,
      }),
    ).resolves.toBeUndefined();

    expect(onFailureMetric).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenNthCalledWith(
      1,
      {
        err: metricFailure,
        operation: 'users.scheduleDeletionReminderEmail',
        userId: 'user_2',
      },
      'Best-effort metric hook failed',
    );
    expect(logger.error).toHaveBeenNthCalledWith(
      2,
      {
        err: sideEffectFailure,
        operation: 'users.scheduleDeletionReminderEmail',
        userId: 'user_2',
      },
      'Best-effort side effect failed',
    );
  });
});
