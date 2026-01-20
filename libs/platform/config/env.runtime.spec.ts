import { deriveServiceName, normalizeNodeEnv } from './env.runtime';
import { NodeEnv } from './env.enums';

describe('env.runtime', () => {
  describe('normalizeNodeEnv', () => {
    it('defaults to development for invalid values', () => {
      expect(normalizeNodeEnv(undefined)).toBe(NodeEnv.Development);
      expect(normalizeNodeEnv('')).toBe(NodeEnv.Development);
      expect(normalizeNodeEnv('prod')).toBe(NodeEnv.Development);
    });

    it('accepts known node env values', () => {
      expect(normalizeNodeEnv('development')).toBe(NodeEnv.Development);
      expect(normalizeNodeEnv('test')).toBe(NodeEnv.Test);
      expect(normalizeNodeEnv('staging')).toBe(NodeEnv.Staging);
      expect(normalizeNodeEnv('production')).toBe(NodeEnv.Production);
    });
  });

  describe('deriveServiceName', () => {
    it('defaults base service name when unset', () => {
      expect(deriveServiceName({ otelServiceName: undefined, role: 'api' })).toBe(
        'backend-core-kit-api',
      );
    });

    it('uses configured OTEL_SERVICE_NAME', () => {
      expect(deriveServiceName({ otelServiceName: 'acme', role: 'worker' })).toBe('acme-worker');
    });
  });
});
