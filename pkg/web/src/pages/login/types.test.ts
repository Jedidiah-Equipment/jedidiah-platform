import { DEFAULT_DEMO_USER_PASSWORD } from '@pkg/domain';
import { describe, expect, it } from 'vitest';

import { LoginForm } from './types.js';

describe('LoginForm', () => {
  it('accepts valid login values', () => {
    expect(
      LoginForm.parse({
        email: 'operator@j.com',
        password: DEFAULT_DEMO_USER_PASSWORD,
      }),
    ).toEqual({
      email: 'operator@j.com',
      password: DEFAULT_DEMO_USER_PASSWORD,
    });
  });

  it('rejects empty or invalid values', () => {
    expect(() => LoginForm.parse({ email: '', password: '' })).toThrow();
    expect(() => LoginForm.parse({ email: 'not-email', password: 'password123' })).toThrow();
  });
});
