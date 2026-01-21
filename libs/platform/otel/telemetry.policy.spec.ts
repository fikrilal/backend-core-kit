import { NodeEnv } from '../config/env.validation';
import { isTelemetryEnabled } from './telemetry.policy';

describe('telemetry.policy', () => {
  it('disables telemetry in test', () => {
    expect(isTelemetryEnabled(NodeEnv.Test, 'http://localhost:4318')).toBe(false);
  });

  it('disables telemetry when endpoint is missing', () => {
    expect(isTelemetryEnabled(NodeEnv.Production, undefined)).toBe(false);
    expect(isTelemetryEnabled(NodeEnv.Production, '')).toBe(false);
    expect(isTelemetryEnabled(NodeEnv.Production, '   ')).toBe(false);
  });

  it('enables telemetry when endpoint is present', () => {
    expect(isTelemetryEnabled(NodeEnv.Production, 'http://localhost:4318')).toBe(true);
  });
});
