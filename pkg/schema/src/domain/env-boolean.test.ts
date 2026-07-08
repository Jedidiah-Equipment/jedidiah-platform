import { describe, expect, it } from 'vitest';

import { defaultedEnvUrl, EnvBoolean, OptionalEnvBoolean, OptionalEnvString } from './env-boolean.js';

describe('EnvBoolean', () => {
  it.each([
    ['true', true],
    ['1', true],
    ['false', false],
    ['0', false],
  ] as const)('parses %s', (value, expected) => {
    expect(EnvBoolean.parse(value)).toBe(expected);
  });

  it('treats blank optional env strings as unset', () => {
    expect(OptionalEnvString.parse('')).toBeUndefined();
    expect(OptionalEnvString.parse('   ')).toBeUndefined();
    expect(OptionalEnvString.parse('phc_test')).toBe('phc_test');
  });

  it('treats blank optional env booleans as unset', () => {
    expect(OptionalEnvBoolean.parse('')).toBeUndefined();
    expect(OptionalEnvBoolean.parse('false')).toBe(false);
  });

  it('uses the default URL when an env URL is blank', () => {
    expect(defaultedEnvUrl('https://example.com').parse('')).toBe('https://example.com');
  });
});
