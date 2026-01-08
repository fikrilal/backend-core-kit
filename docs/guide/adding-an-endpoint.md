# Adding an Endpoint

This guide standardizes the shape of endpoints so clients can be consistent across services.

## Checklist

- [ ] Route is versioned (e.g., `/v1/...`) unless explicitly excluded
- [ ] DTOs validate input (whitelist + forbid unknown fields)
- [ ] Response uses `{ data, meta? }` envelope
- [ ] Errors are RFC7807 with `code` + `traceId`
- [ ] Pagination/filter/sort follow standard conventions when listing
- [ ] OpenAPI decorators document request/response and `x-error-codes`
- [ ] E2E test asserts envelope + error shape + `X-Request-Id`

## Common Pitfalls

- Returning “raw” objects without the envelope
- Throwing framework exceptions without mapping to problem-details
- Adding new error codes without documenting them in OpenAPI
- Implementing ad-hoc pagination/filter formats

