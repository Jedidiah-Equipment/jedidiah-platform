import { describe, expect, test } from 'vitest';

import { parseBetterAuthRole } from './session.js';

describe('parseBetterAuthRole', () => {
  test('parses supported role strings', () => {
    expect(parseBetterAuthRole('admin')).toBe('admin');
  });

  test('accepts the first role from better-auth array-shaped values', () => {
    expect(parseBetterAuthRole(['job-viewer', 'admin'])).toBe('job-viewer');
  });

  test('rejects unsupported role strings', () => {
    expect(() => parseBetterAuthRole('manager')).toThrow();
  });

  test('rejects non-string role values', () => {
    expect(() => parseBetterAuthRole({ role: 'admin' })).toThrow();
  });
});
