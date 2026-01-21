import { DEFAULT_REDACT_PATHS } from './redaction';

describe('DEFAULT_REDACT_PATHS', () => {
  it('includes baseline secret locations', () => {
    expect(DEFAULT_REDACT_PATHS).toEqual(expect.arrayContaining(['req.headers.authorization']));
    expect(DEFAULT_REDACT_PATHS).toEqual(expect.arrayContaining(['req.headers.cookie']));
    expect(DEFAULT_REDACT_PATHS).toEqual(expect.arrayContaining(['*.password']));
    expect(DEFAULT_REDACT_PATHS).toEqual(expect.arrayContaining(['AUTH_SIGNING_KEYS_JSON']));
    expect(DEFAULT_REDACT_PATHS).toEqual(expect.arrayContaining(['OTEL_EXPORTER_OTLP_HEADERS']));
  });
});
