import { NotFoundError } from '../errors';
import type { HttpClient } from '../http';
import type {
  ListMovieQuotesParams,
  ListMoviesParams,
  Movie,
  PaginatedResponse,
  Quote,
} from '../types';
import { buildPaginatedResponse, mapId } from '../utils';
import type { RawListResponse, WithRawId } from '../utils';

export class MoviesResource {
  constructor(private readonly http: HttpClient) {}

  async get(id: string): Promise<Movie> {
    const data = await this.http.get<RawListResponse<WithRawId<Movie>>>(`/movie/${id}`);
    const raw = data.docs[0];
    if (!raw) {
      throw new NotFoundError(`Movie with id "${id}" not found`);
    }
    return mapId(raw);
  }

  async list(params: ListMoviesParams = {}): Promise<PaginatedResponse<Movie>> {
    const raw = await this.http.get<RawListResponse<WithRawId<Movie>>>('/movie', params);
    return buildPaginatedResponse({ ...raw, docs: raw.docs.map(mapId) }, params, (p) => this.list(p));
  }

  async listQuotes(id: string, params: ListMovieQuotesParams = {}): Promise<PaginatedResponse<Quote>> {
    const hasFilters = params.character !== undefined || params.dialog !== undefined;
    const raw = hasFilters
      ? await this.http.get<RawListResponse<WithRawId<Quote>>>('/quote', { ...params, movie: id })
      : await this.http.get<RawListResponse<WithRawId<Quote>>>(`/movie/${id}/quote`, params);
    return buildPaginatedResponse({ ...raw, docs: raw.docs.map(mapId) }, params, (p) => this.listQuotes(id, p));
  }
}
