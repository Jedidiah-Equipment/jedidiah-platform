import { describe, expect } from 'vitest';

import { createTester } from '@/test/create-tester.js';

const test = createTester();

describe('auth.session', () => {
  test('returns null without a session', async ({ context }) => {
    await expect(context.createAnonCaller().auth.session()).resolves.toBeNull();
  });

  test('serializes session dates as ISO strings', async ({ context }) => {
    const result = await context.createCaller().auth.session();

    expect(result?.session.createdAt).toEqual(expect.any(String));
    expect(result?.session.expiresAt).toEqual(expect.any(String));
    expect(result?.session.updatedAt).toEqual(expect.any(String));
    expect(result?.user.createdAt).toEqual(expect.any(String));
    expect(result?.user.updatedAt).toEqual(expect.any(String));
  });
});

describe('auth.me', () => {
  test('serializes user dates as ISO strings', async ({ context }) => {
    const result = await context.createCaller().auth.me();

    expect(result.createdAt).toEqual(expect.any(String));
    expect(result.updatedAt).toEqual(expect.any(String));
  });
});
