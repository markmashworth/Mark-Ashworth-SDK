import { NotFoundError } from '../errors';
import type { HttpClient } from '../http';
import type { ListQuotesParams, PaginatedResponse, Quote } from '../types';
import { buildPaginatedResponse } from '../utils';
import type { RawListResponse } from '../utils';

export class QuotesResource {
  constructor(private readonly http: HttpClient) {}

  async get(id: string): Promise<Quote> {
    const data = await this.http.get<RawListResponse<Quote>>(`/quote/${id}`);
    const quote = data.docs[0];
    if (!quote) {
      throw new NotFoundError(`Quote with id "${id}" not found`);
    }
    return quote;
  }

  async list(params: ListQuotesParams = {}): Promise<PaginatedResponse<Quote>> {
    const raw = await this.http.get<RawListResponse<Quote>>('/quote', params);
    return buildPaginatedResponse(raw, params, (p) => this.list(p));
  }
}
