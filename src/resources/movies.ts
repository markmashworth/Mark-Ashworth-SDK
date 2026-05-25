import { NotFoundError } from '../errors';
import type { HttpClient } from '../http';
import type {
  ListMovieQuotesParams,
  ListMoviesParams,
  Movie,
  PaginatedResponse,
  Quote,
} from '../types';
import { buildPaginatedResponse } from '../utils';
import type { RawListResponse } from '../utils';

export class MoviesResource {
  constructor(private readonly http: HttpClient) {}

  async get(id: string): Promise<Movie> {
    const data = await this.http.get<RawListResponse<Movie>>(`/movie/${id}`);
    const movie = data.docs[0];
    if (!movie) {
      throw new NotFoundError(`Movie with id "${id}" not found`);
    }
    return movie;
  }

  async list(params: ListMoviesParams = {}): Promise<PaginatedResponse<Movie>> {
    const raw = await this.http.get<RawListResponse<Movie>>('/movie', params);
    return buildPaginatedResponse(raw, params, (p) => this.list(p));
  }

  async listQuotes(id: string, params: ListMovieQuotesParams = {}): Promise<PaginatedResponse<Quote>> {
    const raw = await this.http.get<RawListResponse<Quote>>(`/movie/${id}/quote`, params);
    return buildPaginatedResponse(raw, params, (p) => this.listQuotes(id, p));
  }
}
