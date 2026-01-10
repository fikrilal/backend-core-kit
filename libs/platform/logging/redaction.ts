export const DEFAULT_REDACT_PATHS: ReadonlyArray<string> = Object.freeze([
  // HTTP
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',

  // Common secret fields if they accidentally get logged.
  '*.password',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.apiKey',

  // Known config keys.
  'AUTH_SIGNING_KEYS_JSON',
  'OTEL_EXPORTER_OTLP_HEADERS',
]);
