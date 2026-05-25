import { HttpClient } from './http';
import { MoviesResource } from './resources/movies';
import { QuotesResource } from './resources/quotes';
import type { TheOneApiClientOptions } from './types';

export class TheOneApiClient {
  public readonly movies: MoviesResource;
  public readonly quotes: QuotesResource;

  constructor(options: TheOneApiClientOptions) {
    const http = new HttpClient(options);
    this.movies = new MoviesResource(http);
    this.quotes = new QuotesResource(http);
  }
}
