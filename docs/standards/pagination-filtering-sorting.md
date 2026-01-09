# Pagination, Filtering, Sorting

This standard defines how list endpoints behave so clients can implement generic list components.

## Pagination (Cursor-Based)

Request:

- `limit` (optional): integer, default 25, max 250
- `cursor` (optional): opaque string

Example:

`GET /v1/users?limit=25&cursor=eyJpZCI6Ii4uLiJ9`

Response:

```json
{
  "data": [{}],
  "meta": { "nextCursor": "…", "limit": 25 }
}
```

Rules:

- `nextCursor` is omitted when there are no more results.
- Cursor format is opaque to clients. It is typically base64url-encoded JSON.
- Endpoints must define a deterministic default sort so pagination is stable.

## Sorting

Use `sort`:

- comma-separated fields
- prefix `-` for descending

Example:

- `sort=-createdAt,email`

Rules:

- Only allow an explicit allowlist of sortable fields (avoid exposing arbitrary DB columns).
- Default sorting must be documented in OpenAPI.

## Filtering

Use `filter[...]` query parameters:

- Equality: `filter[status]=ACTIVE`
- “In” semantics: `filter[status][in]=ACTIVE,SUSPENDED`
- Range (for numbers/timestamps):
  - `filter[createdAt][gte]=2026-01-01T00:00:00.000Z`
  - `filter[createdAt][lte]=2026-01-31T23:59:59.999Z`

Rules:

- Only allow an explicit allowlist of filterable fields/operators per endpoint.
- Do not implement “generic filtering over all fields” (security + performance footguns).

## Search

Use `q` for free-text search when supported:

- `GET /v1/books?q=atomic+habits`

Rules:

- `q` semantics must be documented per endpoint.
