import { NotFoundError } from '../errors';
import type { HttpClient } from '../http';
import type { ListQuotesParams, PaginatedResponse, Quote } from '../types';
import { buildPaginatedResponse, mapId } from '../utils';
import type { RawListResponse, WithRawId } from '../utils';

export class QuotesResource {
  constructor(private readonly http: HttpClient) {}

  async get(id: string): Promise<Quote> {
    const data = await this.http.get<RawListResponse<WithRawId<Quote>>>(`/quote/${id}`);
    const raw = data.docs[0];
    if (!raw) {
      throw new NotFoundError(`Quote with id "${id}" not found`);
    }
    return mapId(raw);
  }

  async list(params: ListQuotesParams = {}): Promise<PaginatedResponse<Quote>> {
    const raw = await this.http.get<RawListResponse<WithRawId<Quote>>>('/quote', params);
    return buildPaginatedResponse({ ...raw, docs: raw.docs.map(mapId) }, params, (p) => this.list(p));
  }
}
