import { ProductNotFoundError } from '@pkg/core';
import { TRPCError } from '@trpc/server';
import { describe, expect, it, vi } from 'vitest';

import {
  createAuthTRPCError,
  getTRPCAppCode,
  getTRPCPublicMessage,
  mapKnownCoreError,
  serializeError,
  shouldLogTRPCError,
  UNEXPECTED_ERROR_MESSAGE,
} from './errors.js';

describe('tRPC error helpers', () => {
  it('maps expected core errors with public app codes and preserves cause', async () => {
    const cause = new ProductNotFoundError('product-id');

    await expect(
      mapKnownCoreError(
        async () => {
          throw cause;
        },
        (error): error is ProductNotFoundError => error instanceof ProductNotFoundError,
        (error) => ({
          appCode: error.code,
          code: 'NOT_FOUND',
          message: 'Product not found.',
        }),
      ),
    ).rejects.toMatchObject({
      appCode: 'product.not_found',
      cause,
      code: 'NOT_FOUND',
      message: 'Product not found.',
    });
  });

  it('leaves unknown errors untouched', async () => {
    const error = new Error('broken');

    await expect(
      mapKnownCoreError(
        async () => {
          throw error;
        },
        (unknownError): unknownError is ProductNotFoundError => false,
        vi.fn(),
      ),
    ).rejects.toBe(error);
  });

  it('shapes auth, validation, and unexpected errors consistently', () => {
    const authError = createAuthTRPCError({
      appCode: 'auth.unauthenticated',
      code: 'UNAUTHORIZED',
      message: 'Please sign in to continue.',
    });
    const validationError = new TRPCError({ code: 'BAD_REQUEST', message: 'Validation failed' });
    const unexpectedError = new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'database exploded' });

    expect(getTRPCAppCode(authError)).toBe('auth.unauthenticated');
    expect(shouldLogTRPCError(authError)).toBe(false);
    expect(shouldLogTRPCError(validationError)).toBe(false);
    expect(shouldLogTRPCError(unexpectedError)).toBe(true);
    expect(getTRPCPublicMessage(unexpectedError, unexpectedError.message)).toBe(UNEXPECTED_ERROR_MESSAGE);
  });

  it('serializes an error and its cause chain so the real failure is not hidden', () => {
    const rootCause = new Error('domain is not verified');
    const wrapped = new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'draft failed', cause: rootCause });

    expect(serializeError(wrapped)).toMatchObject({
      name: 'TRPCError',
      message: 'draft failed',
      cause: { name: 'Error', message: 'domain is not verified' },
    });
  });

  it('serializes non-Error throwables and undefined', () => {
    expect(serializeError('boom')).toEqual({ value: 'boom' });
    expect(serializeError(undefined)).toBeUndefined();
  });
});
