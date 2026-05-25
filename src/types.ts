export type FetchFunction = (url: string, init?: RequestInit) => Promise<Response>;

export interface RetryConfig {
  maxRetries: number;
  statusCodes: number[];
  initialDelayMs: number;
  maxDelayMs: number;
}

export interface TheOneApiClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  fetch?: FetchFunction;
  retry?: Partial<RetryConfig>;
}

export interface Movie {
  id: string;
  name: string;
  runtimeInMinutes: number;
  budgetInMillions: number;
  boxOfficeRevenueInMillions: number;
  academyAwardNominations: number;
  academyAwardWins: number;
  rottenTomatoesScore: number;
}

export interface Quote {
  id: string;
  dialog: string;
  movie: string;
  character: string;
}

// A NumberFilter can be a plain number (equality) or an operator object.
export type NumberFilter =
  | number
  | { lt: number }
  | { lte: number }
  | { gt: number }
  | { gte: number }
  | { neq: number }
  | { exists: boolean };

// A StringFilter can be a plain string (equality), an array (include list),
// or an operator object.
export type StringFilter =
  | string
  | string[]
  | { neq: string | string[] | { regex: string } }
  | { regex: string }
  | { exists: boolean };

export interface PaginationParams {
  limit?: number;
  page?: number;
  offset?: number;
}

export interface ListMoviesParams extends PaginationParams {
  name?: StringFilter;
  runtimeInMinutes?: NumberFilter;
  budgetInMillions?: NumberFilter;
  boxOfficeRevenueInMillions?: NumberFilter;
  academyAwardNominations?: NumberFilter;
  academyAwardWins?: NumberFilter;
  rottenTomatoesScore?: NumberFilter;
}

export interface ListMovieQuotesParams extends PaginationParams {
  character?: StringFilter;
  dialog?: StringFilter;
}

export interface ListQuotesParams extends PaginationParams {
  movie?: StringFilter;
  character?: StringFilter;
  dialog?: StringFilter;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  page: number;
  pages: number;
  next: (() => Promise<PaginatedResponse<T>>) | null;
}
