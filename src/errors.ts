export class TheOneApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'TheOneApiError';
  }
}

export class AuthenticationError extends TheOneApiError {
  constructor(message: string) {
    super(message, 401);
    this.name = 'AuthenticationError';
  }
}

export class InvalidRequestError extends TheOneApiError {
  constructor(message: string) {
    super(message, 400);
    this.name = 'InvalidRequestError';
  }
}

export class NotFoundError extends TheOneApiError {
  constructor(message: string) {
    super(message, 404);
    this.name = 'NotFoundError';
  }
}

export class RateLimitError extends TheOneApiError {
  constructor(
    message: string,
    public readonly retryAfterMs?: number,
  ) {
    super(message, 429);
    this.name = 'RateLimitError';
  }
}
