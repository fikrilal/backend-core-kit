const mockNodeSdkStart = jest.fn();
const mockNodeSdkShutdown = jest.fn(async () => undefined);
const mockNodeSdkConstructor = jest.fn(() => ({
  start: mockNodeSdkStart,
  shutdown: mockNodeSdkShutdown,
}));
const mockTraceExporterConstructor = jest.fn((options: unknown) => ({ options }));

jest.mock('@opentelemetry/sdk-node', () => ({
  NodeSDK: mockNodeSdkConstructor,
}));

jest.mock('@opentelemetry/exporter-trace-otlp-http', () => ({
  OTLPTraceExporter: mockTraceExporterConstructor,
}));

jest.mock('@opentelemetry/auto-instrumentations-node', () => ({
  getNodeAutoInstrumentations: jest.fn(() => []),
}));

jest.mock('@opentelemetry/resources', () => ({
  resourceFromAttributes: jest.fn((attributes: unknown) => attributes),
}));

import { initTelemetry, parseOtlpHeaders, resolveTracesUrl } from './telemetry';

describe('telemetry', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  const originalHeaders = process.env.OTEL_EXPORTER_OTLP_HEADERS;
  const originalServiceName = process.env.OTEL_SERVICE_NAME;

  beforeEach(() => {
    mockNodeSdkStart.mockClear();
    mockNodeSdkShutdown.mockClear();
    mockNodeSdkConstructor.mockClear();
    mockTraceExporterConstructor.mockClear();
    process.env.NODE_ENV = originalNodeEnv;
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = originalEndpoint;
    process.env.OTEL_EXPORTER_OTLP_HEADERS = originalHeaders;
    process.env.OTEL_SERVICE_NAME = originalServiceName;
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = originalEndpoint;
    process.env.OTEL_EXPORTER_OTLP_HEADERS = originalHeaders;
    process.env.OTEL_SERVICE_NAME = originalServiceName;
  });

  it('normalizes OTLP trace URLs', () => {
    expect(resolveTracesUrl('http://localhost:4318')).toBe('http://localhost:4318/v1/traces');
    expect(resolveTracesUrl('http://localhost:4318/')).toBe('http://localhost:4318/v1/traces');
    expect(resolveTracesUrl('http://localhost:4318/v1/traces')).toBe(
      'http://localhost:4318/v1/traces',
    );
  });

  it('parses OTLP headers from comma-separated key-value pairs', () => {
    expect(parseOtlpHeaders(undefined)).toBeUndefined();
    expect(parseOtlpHeaders('  ')).toBeUndefined();
    expect(parseOtlpHeaders('x-auth=fixture-value,x-scope=abc=123')).toEqual({
      'x-auth': 'fixture-value',
      'x-scope': 'abc=123',
    });
  });

  it('does not initialize SDK when telemetry is disabled', async () => {
    process.env.NODE_ENV = 'test';
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://localhost:4318';

    const telemetry = await initTelemetry('api');
    await telemetry.shutdown();

    expect(mockNodeSdkConstructor).not.toHaveBeenCalled();
    expect(mockNodeSdkStart).not.toHaveBeenCalled();
  });

  it('initializes once and resets lifecycle state on shutdown', async () => {
    process.env.NODE_ENV = 'production';
    process.env.OTEL_SERVICE_NAME = 'core';
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = 'http://collector:4318/';
    process.env.OTEL_EXPORTER_OTLP_HEADERS = 'x-auth=fixture-value';

    await initTelemetry('api');
    const second = await initTelemetry('worker');

    expect(mockNodeSdkConstructor).toHaveBeenCalledTimes(1);
    expect(mockNodeSdkStart).toHaveBeenCalledTimes(1);
    expect(mockTraceExporterConstructor).toHaveBeenCalledWith({
      url: 'http://collector:4318/v1/traces',
      headers: { 'x-auth': 'fixture-value' },
    });

    await second.shutdown();
    expect(mockNodeSdkShutdown).toHaveBeenCalledTimes(1);

    const third = await initTelemetry('worker');
    expect(mockNodeSdkConstructor).toHaveBeenCalledTimes(2);

    await third.shutdown();
    expect(mockNodeSdkShutdown).toHaveBeenCalledTimes(2);
  });
});
