import { NodeEnv } from '../config/env.validation';
import { LogLevel } from '../config/log-level';

export function defaultLogLevel(nodeEnv: NodeEnv): LogLevel {
  if (nodeEnv === NodeEnv.Test) return LogLevel.Silent;
  if (nodeEnv === NodeEnv.Development) return LogLevel.Debug;
  return LogLevel.Info;
}

export function resolveLogLevel(nodeEnv: NodeEnv, configured: LogLevel | undefined): LogLevel {
  return configured ?? defaultLogLevel(nodeEnv);
}

export function isPrettyLogsEnabled(nodeEnv: NodeEnv, configured: boolean | undefined): boolean {
  if (nodeEnv !== NodeEnv.Development) return false;
  return configured !== false;
}
