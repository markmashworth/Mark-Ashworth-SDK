import { describe, it, expect, vi } from 'vitest';
import { QuotesResource } from '../../resources/quotes';
import { NotFoundError } from '../../errors';
import type { HttpClient } from '../../http';

function makeHttp(response: unknown): Pick<HttpClient, 'get'> {
  return { get: vi.fn().mockResolvedValue(response) };
}

const QUOTE = {
  _id: '5cd96e05de30eff6ebcce7e9',
  id: '5cd96e05de30eff6ebcce7e9',
  dialog: 'Deagol!',
  movie: '5cd95395de30eff6ebccde5b',
  character: '5cd99d4bde30eff6ebccfe9e',
};

const RAW_LIST = {
  docs: [QUOTE],
  total: 1,
  limit: 10,
  offset: 0,
  page: 1,
  pages: 1,
};

// ── get() ─────────────────────────────────────────────────────────────────────

describe('QuotesResource.get()', () => {
  it('returns the first doc from the response', async () => {
    const resource = new QuotesResource(makeHttp({ docs: [QUOTE] }) as HttpClient);
    const quote = await resource.get(QUOTE._id);
    expect(quote).toEqual(QUOTE);
  });

  it('calls http.get with the correct path', async () => {
    const http = makeHttp({ docs: [QUOTE] });
    const resource = new QuotesResource(http as HttpClient);
    await resource.get(QUOTE._id);
    expect(http.get).toHaveBeenCalledWith(`/quote/${QUOTE._id}`);
  });

  it('throws NotFoundError when docs is empty', async () => {
    const resource = new QuotesResource(makeHttp({ docs: [] }) as HttpClient);
    await expect(resource.get('bad-id')).rejects.toThrow(NotFoundError);
  });

  it('NotFoundError message includes the ID', async () => {
    const resource = new QuotesResource(makeHttp({ docs: [] }) as HttpClient);
    const err = await resource.get('bad-id').catch(e => e);
    expect(err.message).toContain('bad-id');
  });
});

// ── list() ────────────────────────────────────────────────────────────────────

describe('QuotesResource.list()', () => {
  it('returns items mapped from docs', async () => {
    const resource = new QuotesResource(makeHttp(RAW_LIST) as HttpClient);
    const result = await resource.list();
    expect(result.items).toEqual([QUOTE]);
  });

  it('calls http.get with /quote and no params by default', async () => {
    const http = makeHttp(RAW_LIST);
    const resource = new QuotesResource(http as HttpClient);
    await resource.list();
    expect(http.get).toHaveBeenCalledWith('/quote', {});
  });

  it('passes params through to http.get', async () => {
    const http = makeHttp(RAW_LIST);
    const resource = new QuotesResource(http as HttpClient);
    await resource.list({ movie: '5cd95395de30eff6ebccde5c', dialog: { regex: '/fool/i' } });
    expect(http.get).toHaveBeenCalledWith('/quote', {
      movie: '5cd95395de30eff6ebccde5c',
      dialog: { regex: '/fool/i' },
    });
  });

  it('next is null on a single-page response', async () => {
    const resource = new QuotesResource(makeHttp(RAW_LIST) as HttpClient);
    const result = await resource.list();
    expect(result.next).toBeNull();
  });

  it('next fetches the following page', async () => {
    const http = makeHttp({ ...RAW_LIST, pages: 5 });
    const resource = new QuotesResource(http as HttpClient);
    const result = await resource.list({ limit: 1 });
    await result.next!();
    expect(http.get).toHaveBeenLastCalledWith('/quote', { limit: 1, page: 2 });
  });
});
