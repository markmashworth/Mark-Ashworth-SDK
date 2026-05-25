import { describe, it, expect } from 'vitest';
import {
  TheOneApiError,
  AuthenticationError,
  InvalidRequestError,
  NotFoundError,
  RateLimitError,
} from '../errors';

describe('TheOneApiError', () => {
  it('sets message, status, and name', () => {
    const err = new TheOneApiError('something went wrong', 500);
    expect(err.message).toBe('something went wrong');
    expect(err.status).toBe(500);
    expect(err.name).toBe('TheOneApiError');
  });

  it('is an instance of Error', () => {
    expect(new TheOneApiError('', 0)).toBeInstanceOf(Error);
  });
});

describe('AuthenticationError', () => {
  it('sets status to 401 and correct name', () => {
    const err = new AuthenticationError('Unauthorized');
    expect(err.message).toBe('Unauthorized');
    expect(err.status).toBe(401);
    expect(err.name).toBe('AuthenticationError');
  });

  it('is an instance of TheOneApiError', () => {
    expect(new AuthenticationError('')).toBeInstanceOf(TheOneApiError);
  });
});

describe('InvalidRequestError', () => {
  it('sets status to 400 and correct name', () => {
    const err = new InvalidRequestError('Bad request');
    expect(err.message).toBe('Bad request');
    expect(err.status).toBe(400);
    expect(err.name).toBe('InvalidRequestError');
  });

  it('is an instance of TheOneApiError', () => {
    expect(new InvalidRequestError('')).toBeInstanceOf(TheOneApiError);
  });
});

describe('NotFoundError', () => {
  it('sets status to 404 and correct name', () => {
    const err = new NotFoundError('Not found');
    expect(err.message).toBe('Not found');
    expect(err.status).toBe(404);
    expect(err.name).toBe('NotFoundError');
  });

  it('is an instance of TheOneApiError', () => {
    expect(new NotFoundError('')).toBeInstanceOf(TheOneApiError);
  });
});

describe('RateLimitError', () => {
  it('sets status to 429 and correct name', () => {
    const err = new RateLimitError('Too many requests');
    expect(err.message).toBe('Too many requests');
    expect(err.status).toBe(429);
    expect(err.name).toBe('RateLimitError');
  });

  it('carries retryAfterMs when provided', () => {
    const err = new RateLimitError('Too many requests', 5000);
    expect(err.retryAfterMs).toBe(5000);
  });

  it('retryAfterMs is undefined when not provided', () => {
    const err = new RateLimitError('Too many requests');
    expect(err.retryAfterMs).toBeUndefined();
  });

  it('is an instance of TheOneApiError', () => {
    expect(new RateLimitError('')).toBeInstanceOf(TheOneApiError);
  });
});
