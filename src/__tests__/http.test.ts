import { describe, it, expect, vi } from 'vitest';
import { HttpClient } from '../http';
import {
  AuthenticationError,
  InvalidRequestError,
  NotFoundError,
  RateLimitError,
  TheOneApiError,
} from '../errors';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeResponse(
  status: number,
  body: unknown = { message: 'error' },
  headers: Record<string, string> = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: String(status),
    json: vi.fn().mockResolvedValue(body),
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  } as unknown as Response;
}

// Set maxDelayMs: 0 so retries don't actually wait in tests.
function makeClient(fetchFn: () => Promise<Response>, overrides: object = {}): HttpClient {
  return new HttpClient({
    apiKey: 'test-key',
    fetch: fetchFn as unknown as typeof fetch,
    retry: { maxRetries: 2, statusCodes: [429, 503], initialDelayMs: 0, maxDelayMs: 0 },
    ...overrides,
  });
}

// Returns a mock fetch that cycles through each response in order, repeating
// the last one if called more times than there are entries.
function mockFetch(...responses: Response[]): ReturnType<typeof vi.fn> {
  let call = 0;
  return vi.fn().mockImplementation(() => {
    const response = responses[call] ?? responses[responses.length - 1];
    call++;
    return Promise.resolve(response);
  });
}

// ── Successful requests ───────────────────────────────────────────────────────

describe('HttpClient', () => {
  describe('successful request', () => {
    it('returns the parsed JSON body', async () => {
      const fetch = mockFetch(makeResponse(200, { docs: [{ _id: '1' }] }));
      const client = makeClient(fetch);
      const result = await client.get('/movie');
      expect(result).toEqual({ docs: [{ _id: '1' }] });
    });

    it('sends the Authorization header', async () => {
      const fetch = mockFetch(makeResponse(200, {}));
      const client = makeClient(fetch);
      await client.get('/movie');
      const [, init] = (fetch.mock.calls[0] as [string, RequestInit]);
      expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer test-key');
    });

    it('appends plain params to the URL', async () => {
      const fetch = mockFetch(makeResponse(200, {}));
      const client = makeClient(fetch);
      await client.get('/movie', { limit: 5, page: 2 });
      const [url] = fetch.mock.calls[0] as [string];
      expect(url).toContain('limit=5');
      expect(url).toContain('page=2');
    });

    it('serializes filter params into the URL', async () => {
      const fetch = mockFetch(makeResponse(200, {}));
      const client = makeClient(fetch);
      await client.get('/movie', { budgetInMillions: { lt: 100 } });
      const [url] = fetch.mock.calls[0] as [string];
      // lt encodes as key=`budgetInMillions<100`, value=``
      expect(decodeURIComponent(url)).toContain('budgetInMillions<100');
    });
  });

  // ── Error mapping ───────────────────────────────────────────────────────────

  describe('error mapping', () => {
    it('400 → InvalidRequestError', async () => {
      const client = makeClient(mockFetch(makeResponse(400, { message: 'Bad request' })));
      await expect(client.get('/movie')).rejects.toThrow(InvalidRequestError);
    });

    it('401 → AuthenticationError', async () => {
      const client = makeClient(mockFetch(makeResponse(401, { message: 'Unauthorized' })));
      await expect(client.get('/movie')).rejects.toThrow(AuthenticationError);
    });

    it('404 → NotFoundError', async () => {
      const client = makeClient(mockFetch(makeResponse(404, { message: 'Not found' })));
      await expect(client.get('/movie/bad-id')).rejects.toThrow(NotFoundError);
    });

    it('429 → RateLimitError (after retries exhausted)', async () => {
      const client = makeClient(mockFetch(makeResponse(429, { message: 'Too many requests' })));
      await expect(client.get('/movie')).rejects.toThrow(RateLimitError);
    });

    it('429 with Retry-After header → RateLimitError carries retryAfterMs', async () => {
      const response = makeResponse(429, { message: 'Too many requests' }, { 'retry-after': '60' });
      // maxRetries: 0 so the client throws on the first attempt — no waiting between retries
      const client = makeClient(mockFetch(response), {
        retry: { maxRetries: 0, statusCodes: [429, 503], initialDelayMs: 0, maxDelayMs: 0 },
      });
      const err = await client.get('/movie').catch(e => e) as RateLimitError;
      expect(err).toBeInstanceOf(RateLimitError);
      expect(err.retryAfterMs).toBe(60_000);
    });

    it('500 → TheOneApiError with correct status', async () => {
      const client = makeClient(mockFetch(makeResponse(500, { message: 'Internal server error' })));
      const err = await client.get('/movie').catch(e => e) as TheOneApiError;
      expect(err).toBeInstanceOf(TheOneApiError);
      expect(err.status).toBe(500);
    });

    it('uses the message from the response body', async () => {
      const client = makeClient(mockFetch(makeResponse(404, { message: 'Movie not found' })));
      const err = await client.get('/movie/123').catch(e => e) as TheOneApiError;
      expect(err.message).toBe('Movie not found');
    });
  });

  // ── Retry behaviour ─────────────────────────────────────────────────────────

  describe('retry behaviour', () => {
    it('retries on 503 and succeeds when a later attempt returns 200', async () => {
      const fetch = mockFetch(
        makeResponse(503),
        makeResponse(503),
        makeResponse(200, { docs: [] }),
      );
      const client = makeClient(fetch);
      const result = await client.get('/movie');
      expect(result).toEqual({ docs: [] });
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('retries on 429 and succeeds when a later attempt returns 200', async () => {
      const fetch = mockFetch(
        makeResponse(429),
        makeResponse(200, { docs: [] }),
      );
      const client = makeClient(fetch);
      await client.get('/movie');
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('throws after exhausting all retries', async () => {
      const fetch = mockFetch(makeResponse(503));
      const client = makeClient(fetch); // maxRetries: 2
      await expect(client.get('/movie')).rejects.toThrow(TheOneApiError);
      expect(fetch).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });

    it('does not retry on non-retryable status codes', async () => {
      const fetch = mockFetch(makeResponse(500));
      const client = makeClient(fetch);
      await expect(client.get('/movie')).rejects.toThrow(TheOneApiError);
      expect(fetch).toHaveBeenCalledTimes(1); // no retries
    });

    it('does not retry on 400 errors', async () => {
      const fetch = mockFetch(makeResponse(400));
      const client = makeClient(fetch);
      await expect(client.get('/movie')).rejects.toThrow(InvalidRequestError);
      expect(fetch).toHaveBeenCalledTimes(1);
    });
  });
});
