import type { StorageAdapter } from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect, test } from 'vitest';

import { mockSession } from '@/test/test-utils.js';
import { createAiV2Context } from './ai-context.js';

describe('createAiV2Context', () => {
  test('injects v2 document generation and email delivery dependencies independently of legacy AI', () => {
    const storage = {} as StorageAdapter;
    const access = createUserAccessSummary({ role: 'sales', userId: 'test-user-id' });
    const ctx = createAiV2Context({
      access,
      db: {} as Parameters<typeof createAiV2Context>[0]['db'],
      session: mockSession('sales'),
      storage,
    });

    expect(ctx.access).toBe(access);
    expect(ctx.storage).toBe(storage);
    expect(ctx.brochureRenderer).toBeTypeOf('function');
    expect(ctx.quoteDocumentRenderer).toBeTypeOf('function');
    expect(ctx.sendEmail).toBeTypeOf('function');
    expect(ctx.session?.user).toEqual({
      assistantEnabled: true,
      email: 'test@example.com',
      id: 'test-user-id',
    });
  });
});
