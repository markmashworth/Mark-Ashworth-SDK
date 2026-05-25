import type { PaginatedResponse } from './types';

export type WithRawId<T> = Omit<T, 'id'> & { _id: string };

export function mapId<T extends { _id: string }>(raw: T): Omit<T, '_id'> & { id: string } {
  const { _id, ...rest } = raw;
  return { id: _id, ...rest } as Omit<T, '_id'> & { id: string };
}

/**
 * Serializes a single filter field into URLSearchParams using the API's
 * operator encoding convention:
 *
 *   lt:     key = "field<value",  val = ""
 *   lte:    key = "field<",       val = "value"   (?field<=value splits on first =)
 *   gt:     key = "field>value",  val = ""
 *   gte:    key = "field>",       val = "value"   (?field>=value splits on first =)
 *   neq:    key = "field!",       val = "value"
 *   regex:  key = "field",        val = "/pattern/flags"
 *   exists: key = "field",        val = ""   (or key = "!field" for non-existence)
 */
export function serializeFilterParam(
  field: string,
  filter: unknown,
  searchParams: URLSearchParams,
): void {
  if (filter === undefined || filter === null) return;

  // Plain primitive — simple equality
  if (typeof filter === 'string' || typeof filter === 'number') {
    searchParams.set(field, String(filter));
    return;
  }

  // Array — comma-separated include list
  if (Array.isArray(filter)) {
    searchParams.set(field, filter.join(','));
    return;
  }

  if (typeof filter === 'object') {
    if ('lt' in filter)  { searchParams.set(`${field}<${filter.lt}`, ''); return; }
    if ('lte' in filter) { searchParams.set(`${field}<`, String(filter.lte)); return; }
    if ('gt' in filter)  { searchParams.set(`${field}>${filter.gt}`, ''); return; }
    if ('gte' in filter) { searchParams.set(`${field}>`, String(filter.gte)); return; }
    if ('neq' in filter) {
      const neq = filter.neq;
      let v: string;
      if (Array.isArray(neq)) v = neq.join(',');
      else if (typeof neq === 'object' && neq !== null && 'regex' in neq) v = String(neq.regex);
      else v = String(neq);
      searchParams.set(`${field}!`, v);
      return;
    }
    if ('regex' in filter) { searchParams.set(field, String(filter.regex)); return; }
    if ('exists' in filter) {
      if (filter.exists) searchParams.set(field, '');
      else searchParams.set(`!${field}`, '');
      return;
    }
  }
}

export interface RawListResponse<T> {
  docs: T[];
  total: number;
  limit: number;
  offset: number;
  page: number;
  pages: number;
}

export function buildPaginatedResponse<T, P extends { page?: number }>(
  raw: RawListResponse<T>,
  params: P,
  fetcher: (params: P) => Promise<PaginatedResponse<T>>,
): PaginatedResponse<T> {
  return {
    items: raw.docs,
    total: raw.total,
    limit: raw.limit,
    offset: raw.offset,
    page: raw.page,
    pages: raw.pages,
    next: raw.page < raw.pages
      ? () => fetcher({ ...params, page: raw.page + 1 })
      : null,
  };
}
