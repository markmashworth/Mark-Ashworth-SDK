import { describe, it, expect, vi } from 'vitest';
import { MoviesResource } from '../../resources/movies';
import { NotFoundError } from '../../errors';
import type { HttpClient } from '../../http';

function makeHttp(response: unknown): Pick<HttpClient, 'get'> {
  return { get: vi.fn().mockResolvedValue(response) };
}

const MOVIE = {
  _id: '5cd95395de30eff6ebccde5c',
  name: 'The Fellowship of the Ring',
  runtimeInMinutes: 178,
  budgetInMillions: 93,
  boxOfficeRevenueInMillions: 871.5,
  academyAwardNominations: 13,
  academyAwardWins: 4,
  rottenTomatoesScore: 91,
};

const RAW_LIST = {
  docs: [MOVIE],
  total: 1,
  limit: 10,
  offset: 0,
  page: 1,
  pages: 1,
};

// ── get() ─────────────────────────────────────────────────────────────────────

describe('MoviesResource.get()', () => {
  it('returns the first doc from the response', async () => {
    const resource = new MoviesResource(makeHttp({ docs: [MOVIE] }) as HttpClient);
    const movie = await resource.get(MOVIE._id);
    expect(movie).toEqual(MOVIE);
  });

  it('calls http.get with the correct path', async () => {
    const http = makeHttp({ docs: [MOVIE] });
    const resource = new MoviesResource(http as HttpClient);
    await resource.get(MOVIE._id);
    expect(http.get).toHaveBeenCalledWith(`/movie/${MOVIE._id}`);
  });

  it('throws NotFoundError when docs is empty', async () => {
    const resource = new MoviesResource(makeHttp({ docs: [] }) as HttpClient);
    await expect(resource.get('bad-id')).rejects.toThrow(NotFoundError);
  });

  it('NotFoundError message includes the ID', async () => {
    const resource = new MoviesResource(makeHttp({ docs: [] }) as HttpClient);
    const err = await resource.get('bad-id').catch(e => e);
    expect(err.message).toContain('bad-id');
  });
});

// ── list() ────────────────────────────────────────────────────────────────────

describe('MoviesResource.list()', () => {
  it('returns items mapped from docs', async () => {
    const resource = new MoviesResource(makeHttp(RAW_LIST) as HttpClient);
    const result = await resource.list();
    expect(result.items).toEqual([MOVIE]);
  });

  it('calls http.get with /movie and no params by default', async () => {
    const http = makeHttp(RAW_LIST);
    const resource = new MoviesResource(http as HttpClient);
    await resource.list();
    expect(http.get).toHaveBeenCalledWith('/movie', {});
  });

  it('passes params through to http.get', async () => {
    const http = makeHttp(RAW_LIST);
    const resource = new MoviesResource(http as HttpClient);
    await resource.list({ limit: 5, name: 'The Two Towers' });
    expect(http.get).toHaveBeenCalledWith('/movie', { limit: 5, name: 'The Two Towers' });
  });

  it('next is null on a single-page response', async () => {
    const resource = new MoviesResource(makeHttp(RAW_LIST) as HttpClient);
    const result = await resource.list();
    expect(result.next).toBeNull();
  });

  it('next fetches the following page', async () => {
    const http = makeHttp({ ...RAW_LIST, pages: 3 });
    const resource = new MoviesResource(http as HttpClient);
    const result = await resource.list({ limit: 1 });
    await result.next!();
    expect(http.get).toHaveBeenLastCalledWith('/movie', { limit: 1, page: 2 });
  });
});

// ── listQuotes() ──────────────────────────────────────────────────────────────

describe('MoviesResource.listQuotes()', () => {
  const RAW_QUOTES = {
    docs: [{ _id: 'q1', dialog: 'You shall not pass!', movie: MOVIE._id, character: 'c1', id: 'q1' }],
    total: 1,
    limit: 10,
    offset: 0,
    page: 1,
    pages: 1,
  };

  it('calls http.get with the correct path', async () => {
    const http = makeHttp(RAW_QUOTES);
    const resource = new MoviesResource(http as HttpClient);
    await resource.listQuotes(MOVIE._id);
    expect(http.get).toHaveBeenCalledWith(`/movie/${MOVIE._id}/quote`, {});
  });

  it('returns items mapped from docs', async () => {
    const resource = new MoviesResource(makeHttp(RAW_QUOTES) as HttpClient);
    const result = await resource.listQuotes(MOVIE._id);
    expect(result.items).toEqual(RAW_QUOTES.docs);
  });

  it('passes filter params through to http.get', async () => {
    const http = makeHttp(RAW_QUOTES);
    const resource = new MoviesResource(http as HttpClient);
    await resource.listQuotes(MOVIE._id, { dialog: { regex: '/fool/i' } });
    expect(http.get).toHaveBeenCalledWith(
      `/movie/${MOVIE._id}/quote`,
      { dialog: { regex: '/fool/i' } },
    );
  });
});
