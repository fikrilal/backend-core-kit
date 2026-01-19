# Pagination, Filtering, Sorting

This standard defines how list endpoints behave so clients can implement generic list components.

## Pagination (Cursor-Based)

Request:

- `limit` (optional): integer, default 25, max is endpoint-defined (default max 250)
- `cursor` (optional): opaque string

Example:

`GET /v1/users?limit=25&cursor=eyJpZCI6Ii4uLiJ9`

Response:

```json
{
  "data": [{}],
  "meta": { "nextCursor": "…", "limit": 25, "hasMore": true }
}
```

Rules:

- `nextCursor` is omitted when there are no more results.
- `hasMore` is `true` when another page exists.
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
- Max 3 sort fields (reject more).
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
- For `filter[...][in]`, only comma-separated lists are supported (no repeated params).

## Search

Use `q` for free-text search when supported:

- `GET /v1/books?q=atomic+habits`

Rules:

- `q` semantics must be documented per endpoint.

## Implementation (Core Kit)

This repo provides a standard implementation for cursor pagination + filtering + sorting.

### HTTP (NestJS)

**Always** parse list query params via the platform pipe/decorator (not by calling the shared parser directly on `req.query`).

Use:

- `ListQueryParam(...)`: `libs/platform/http/list-query/list-query.decorator.ts`
  - Validates/coerces query params via `CursorPaginationQueryDto`.
  - Produces a typed `ListQuery` by calling `parseListQuery(...)` from `libs/shared/list-query`.
  - Maps validation failures to RFC7807 with `code: VALIDATION_FAILED` and `errors[]`.

Example:

```ts
import { Controller, Get } from '@nestjs/common';
// Adjust these import paths to match your controller's location.
// Example below assumes a controller under: `libs/features/<feature>/infra/http/*`
import { ListQueryParam } from '../../../../platform/http/list-query/list-query.decorator';
import type { ListQuery } from '../../../../shared/list-query';

type SortField = 'createdAt' | 'email';
type FilterField = 'status' | 'createdAt';

@Controller()
export class UsersController {
  @Get('users')
  async listUsers(
    @ListQueryParam<SortField, FilterField>({
      defaultLimit: 25,
      maxLimit: 250,
      search: true,
      sort: {
        allowed: { createdAt: { type: 'datetime' }, email: { type: 'string' } },
        default: [{ field: 'createdAt', direction: 'desc' }],
        tieBreaker: { field: 'email', direction: 'asc' },
      },
      filters: {
        status: { type: 'enum', ops: ['eq', 'in'], enumValues: ['ACTIVE', 'SUSPENDED'] },
        createdAt: { type: 'datetime', ops: ['gte', 'lte'] },
      },
    })
    query: ListQuery<SortField, FilterField>,
  ) {
    return query;
  }
}
```

### Shared parsing (`libs/shared/list-query`)

`parseListQuery(...)` is a lower-level parser intended for already-validated inputs (e.g., after DTO validation).

Notes:

- It accepts `unknown` inputs so it can be used by non-HTTP callers.
- Some fields are permissive by design (for example, a non-parseable `limit` can fall back to the default). This is why HTTP code should go through `ListQueryParam` / `ListQueryPipe`, which fails fast and returns consistent `VALIDATION_FAILED` problem details.
