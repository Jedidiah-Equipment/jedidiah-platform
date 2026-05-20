import { describe, expect, it } from 'vitest';

import { EnvBoolean } from './env-boolean.js';

describe('EnvBoolean', () => {
  it.each([
    ['true', true],
    ['1', true],
    ['false', false],
    ['0', false],
  ] as const)('parses %s', (value, expected) => {
    expect(EnvBoolean.parse(value)).toBe(expected);
  });
});
