# SDK Design

This document explains the key design decisions behind the TypeScript SDK for The One API.

## Overview

The SDK wraps The One API's REST interface in a typed, composable TypeScript client. Its goals are:

- **Type safety** — every request param and response field is typed
- **Predictable errors** — HTTP status codes map to specific exception classes
- **Resilience** — automatic retry with exponential backoff and `Retry-After` respect
- **Testability** — zero real I/O in unit tests via injectable fetch
- **Compatibility** — works in both CommonJS and ES Module environments

---

## File structure

```
src/
  client.ts          — Public entry point: TheOneApiClient
  types.ts           — All shared types (params, responses, filters, config)
  errors.ts          — Error class hierarchy
  http.ts            — HTTP client (fetch, retry, URL building, error mapping)
  utils.ts           — serializeFilterParam, buildPaginatedResponse
  resources/
    movies.ts        — MoviesResource (get, list, listQuotes)
    quotes.ts        — QuotesResource (get, list)
  __tests__/         — Unit tests (Vitest)
    errors.test.ts
    utils.test.ts
    http.test.ts
    resources/
      movies.test.ts
      quotes.test.ts
```

---

## Key design decisions

### Resource-based namespacing

Each API domain (movies, quotes) has its own resource class. The root client simply instantiates them and exposes them as properties:

```ts
const client = new TheOneApiClient({ apiKey: '...' });
client.movies.get(id);
client.quotes.list();
```

This keeps the entry point thin and makes it easy to add new resources (e.g. `client.characters`) without touching existing code.

### HttpClient as the only dependency

Resource classes receive an `HttpClient` via constructor injection rather than creating their own. This has two benefits:

1. **Testability** — unit tests can pass a mock `{ get: vi.fn() }` instead of a real HTTP client, making every test synchronous and deterministic with no network I/O.
2. **Single configuration point** — all retry logic, auth headers, base URL, and timeout live in `HttpClient`. Resources don't need to know about any of it.

### Response unwrapping

The One API wraps every response in a `{ docs: [...], total, limit, ... }` envelope — even requests for a single resource by ID. The SDK unwraps this automatically:

- `get(id)` fetches `/{resource}/{id}`, reads `docs[0]`, and throws `NotFoundError` if the array is empty.
- `list()` fetches `/{resource}`, maps `docs` to `items`, and attaches a `next()` function.

Callers never see the raw envelope.

### `items` instead of `docs`

The raw API uses `docs` (a MongoDB-ism). The SDK renames this to `items` in `PaginatedResponse<T>`. This is a cleaner, domain-neutral name that doesn't leak the API's database choice to consumers.

### Pagination with `next()`

Rather than forcing callers to manage page numbers, paginated responses carry a `next` function:

```ts
const page = await client.movies.list({ limit: 2 });
if (page.next) {
  const page2 = await page.next();
}
```

`next` is `null` on the last page (`page === pages`), so callers can check it as a boolean. When called, it re-invokes the original list method with all original params merged with `{ page: currentPage + 1 }`. This means filters, limits, and offsets are all preserved automatically.

### Filter type system

The API supports rich filtering via unusual URL encoding where operators are embedded in the query param key:

```
/movie?runtimeInMinutes<150=     ← key is "runtimeInMinutes<150", value is ""
/movie?academyAwardWins>=2       ← key is "academyAwardWins>", value is "2"
/quote?dialog=/precious/i        ← regex match
/quote?dialog!=/fool/i           ← regex negation (operator in key)
```

Rather than exposing this encoding detail to callers, the SDK provides two TypeScript union types — `NumberFilter` and `StringFilter` — that express the full operator space as plain objects:

```ts
{ runtimeInMinutes: { lt: 150 } }
{ dialog: { neq: { regex: '/fool/i' } } }
```

`serializeFilterParam` in `utils.ts` translates each operator variant into the appropriate `URLSearchParams` entries. This keeps the types discoverable (auto-complete works), hides encoding quirks, and centralises the translation in one testable function.

### Error class hierarchy

All SDK errors extend `TheOneApiError`, which itself extends `Error`. This lets callers catch at whatever level of specificity they need:

```ts
catch (e) {
  if (e instanceof NotFoundError) { ... }      // specific
  else if (e instanceof TheOneApiError) { ... } // any API error
  else { throw e; }                             // unexpected
}
```

`RateLimitError` carries an optional `retryAfterMs` field (in milliseconds) parsed from the `Retry-After` response header. This lets callers implement their own waiting logic if they've disabled automatic retry.

### Retry with exponential backoff

The HTTP client retries automatically on configurable status codes (default: 429, 503). The delay formula is:

```
min(initialDelayMs × 2^attempt + jitter, maxDelayMs)
```

Jitter (±20%) prevents thundering herd when many clients retry simultaneously after an outage.

If the server sends a `Retry-After` header, its value is used verbatim (supporting both integer seconds and HTTP-date formats). This takes full precedence over the calculated backoff — respecting the server's guidance is almost always the right call.

### Injectable fetch

The `fetch` function used by `HttpClient` is configurable via the `TheOneApiClientOptions` object. It defaults to `globalThis.fetch`. This means:

- Unit tests can pass `vi.fn()` returning canned responses — no real HTTP
- Integration tests use real `fetch`
- Callers who need middleware (logging, metrics, request signing) can wrap fetch themselves

### Dual CJS/ESM output

The SDK ships two compiled outputs:

- `dist/cjs/` — CommonJS, for `require()` in older Node.js projects and bundlers
- `dist/esm/` — ES Modules, for `import` in modern environments and tree-shaking bundlers

`package.json` uses the `exports` field to route each entry point to the correct build. Each `dist/` subdirectory also contains a `package.json` marking it as `"type": "commonjs"` or `"type": "module"` respectively, ensuring Node resolves extensions correctly regardless of the project's own module setting.

TypeScript consumers get a single `types` declaration from the ESM build.

### No `sort` support

The One API documents a `sort` query parameter but it does not work correctly on the live API (as verified during development). The SDK omits it entirely rather than exposing a param that silently has no effect.

---

## Testing strategy

**Unit tests** (Vitest) run entirely offline. They test every layer in isolation:

- `errors.test.ts` verifies the class hierarchy and status codes
- `utils.test.ts` exercises every filter operator branch and pagination helper
- `http.test.ts` uses a mock fetch to verify auth headers, URL serialization, error mapping, and retry logic — including that retry delays are skipped in tests via `maxDelayMs: 0`
- Resource tests use a mock `HttpClient` to verify path construction and param passthrough without touching HTTP

**Integration tests** (`scripts/test-production-*.ts`) run against the live API using the real dataset of 8 movies and a large corpus of quotes. They exercise all filter operators and pagination end-to-end. These run in CI via GitHub Actions using a repository secret (`THE_ONE_API_KEY`), and their non-zero exit code causes the workflow to fail on any assertion failure.
