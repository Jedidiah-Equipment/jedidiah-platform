import { describe, expect, it } from 'vitest';

import {
  getApiErrorAppCode,
  getApiErrorMessage,
  getApiMutationErrorMessage,
  getApiQueryErrorMessage,
  UNEXPECTED_ERROR_MESSAGE,
} from './api-errors.js';

describe('api error presentation', () => {
  it('uses API messages for mapped errors', () => {
    const error = {
      data: { appCode: 'product.duplicate_name' },
      message: 'A product with this name already exists.',
    };

    expect(getApiErrorMessage(error)).toBe('A product with this name already exists.');
    expect(getApiErrorAppCode(error)).toBe('product.duplicate_name');
  });

  it('uses contextual fallbacks for unknown mutation and query errors', () => {
    expect(getApiMutationErrorMessage(new Error(), 'Unable to save product.')).toBe('Unable to save product.');
    expect(getApiQueryErrorMessage(new Error(), 'Unable to load products.')).toBe('Unable to load products.');
  });

  it('uses the global fallback when no context is provided', () => {
    expect(getApiErrorMessage({})).toBe(UNEXPECTED_ERROR_MESSAGE);
  });
});
