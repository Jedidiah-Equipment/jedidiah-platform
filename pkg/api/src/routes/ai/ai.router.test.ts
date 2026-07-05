import { describe, expect } from 'vitest';

import { createTester } from '@/test/create-tester.js';
import { mockSession } from '@/test/test-utils.js';

const test = createTester();

describe('ai.debugInfo', () => {
  test('rejects anonymous callers', async ({ context }) => {
    await expect(context.createAnonCaller().ai.debugInfo()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  test('returns the assembled system prompt and every tool for a signed-in user', async ({ context }) => {
    const info = await context.createCaller(mockSession('admin')).ai.debugInfo();

    expect(info.systemPrompt).toContain('## Role');
    expect(info.tools).toHaveLength(18);
    expect(info.tools.every((tool) => tool.authorized)).toBe(true);
  });

  test('flags tools the caller is not permitted to use without hiding them', async ({ context }) => {
    const info = await context.createCaller(mockSession('procurement-manager')).ai.debugInfo();

    const authorized = new Map(info.tools.map((tool) => [tool.name, tool.authorized]));
    expect(info.tools).toHaveLength(18);
    expect(authorized.get('createQuote')).toBe(false);
    expect(authorized.get('listProducts')).toBe(true);
  });
});
