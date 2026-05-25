import {
  AuthenticationError,
  InvalidRequestError,
  NotFoundError,
  RateLimitError,
  TheOneApiError,
} from './errors';
import type { FetchFunction, RetryConfig, TheOneApiClientOptions } from './types';
import { serializeFilterParam } from './utils';

const DEFAULT_BASE_URL = 'https://the-one-api.dev/v2';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRY: RetryConfig = {
  maxRetries: 2,
  statusCodes: [429, 503],
  initialDelayMs: 500,
  maxDelayMs: 30_000,
};

export class HttpClient {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly retry: RetryConfig;
  private readonly fetchFn: FetchFunction;
  private readonly timeout: number;

  constructor(options: TheOneApiClientOptions) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.authHeader = `Bearer ${options.apiKey}`;
    this.retry = { ...DEFAULT_RETRY, ...options.retry };
    this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeout = options.timeout ?? DEFAULT_TIMEOUT_MS;
  }

  async get<T>(path: string, params?: object): Promise<T> {
    const url = this.buildUrl(path, params);
    return this.requestWithRetry<T>(url);
  }

  private async requestWithRetry<T>(url: string): Promise<T> {
    const { maxRetries, statusCodes } = this.retry;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const response = await this.fetchWithTimeout(url);

      if (response.ok) {
        return response.json() as Promise<T>;
      }

      const shouldRetry = attempt < maxRetries && statusCodes.includes(response.status);

      if (!shouldRetry) {
        return this.throwForResponse(response);
      }

      await this.waitBeforeRetry(response, attempt);
    }

    // Unreachable, but TypeScript needs a return path
    throw new TheOneApiError('Unexpected error', 0);
  }

  private async fetchWithTimeout(url: string): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    try {
      return await this.fetchFn(url, {
        method: 'GET',
        headers: { Authorization: this.authHeader },
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new TheOneApiError(`Request timed out after ${this.timeout}ms`, 0);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async throwForResponse(response: Response): Promise<never> {
    const body = await response.json().catch(() => null);
    const message: string = body?.message ?? response.statusText;

    switch (response.status) {
      case 400:
        throw new InvalidRequestError(message);
      case 401:
        throw new AuthenticationError(message);
      case 404:
        throw new NotFoundError(message);
      case 429: {
        const retryAfterMs = this.parseRetryAfterMs(response.headers.get('Retry-After'));
        throw new RateLimitError(message, retryAfterMs ?? undefined);
      }
      default:
        throw new TheOneApiError(message, response.status);
    }
  }

  private async waitBeforeRetry(response: Response, attempt: number): Promise<void> {
    const retryAfterMs = this.parseRetryAfterMs(response.headers.get('Retry-After'));
    const delayMs = retryAfterMs ?? this.exponentialDelayMs(attempt);
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
  }

  private parseRetryAfterMs(header: string | null): number | null {
    if (header === null) return null;
    const seconds = Number(header);
    if (!isNaN(seconds) && seconds >= 0) return seconds * 1000;
    const date = new Date(header);
    if (!isNaN(date.getTime())) return Math.max(0, date.getTime() - Date.now());
    return null;
  }

  private exponentialDelayMs(attempt: number): number {
    const jitter = Math.random() * 100;
    return Math.min(
      this.retry.initialDelayMs * Math.pow(2, attempt) + jitter,
      this.retry.maxDelayMs,
    );
  }

  private buildUrl(path: string, params?: object): string {
    const url = new URL(this.baseUrl + path);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        serializeFilterParam(key, value, url.searchParams);
      }
    }
    return url.toString();
  }
}
