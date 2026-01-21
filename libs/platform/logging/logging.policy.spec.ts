import { NodeEnv } from '../config/env.validation';
import { LogLevel } from '../config/log-level';
import { defaultLogLevel, isPrettyLogsEnabled, resolveLogLevel } from './logging.policy';

describe('logging.policy', () => {
  it('defaults LOG_LEVEL based on NODE_ENV', () => {
    expect(defaultLogLevel(NodeEnv.Test)).toBe(LogLevel.Silent);
    expect(defaultLogLevel(NodeEnv.Development)).toBe(LogLevel.Debug);
    expect(defaultLogLevel(NodeEnv.Staging)).toBe(LogLevel.Info);
    expect(defaultLogLevel(NodeEnv.Production)).toBe(LogLevel.Info);
  });

  it('uses configured LOG_LEVEL when provided', () => {
    expect(resolveLogLevel(NodeEnv.Production, LogLevel.Warn)).toBe(LogLevel.Warn);
  });

  it('defaults pretty logs to enabled in development', () => {
    expect(isPrettyLogsEnabled(NodeEnv.Development, undefined)).toBe(true);
    expect(isPrettyLogsEnabled(NodeEnv.Development, true)).toBe(true);
    expect(isPrettyLogsEnabled(NodeEnv.Development, false)).toBe(false);
  });

  it('disables pretty logs outside development', () => {
    expect(isPrettyLogsEnabled(NodeEnv.Test, true)).toBe(false);
    expect(isPrettyLogsEnabled(NodeEnv.Production, true)).toBe(false);
  });
});
