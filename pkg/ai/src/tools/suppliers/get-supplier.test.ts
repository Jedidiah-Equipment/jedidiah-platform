import * as core from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect } from 'vitest';
import { z } from 'zod';
import { createTester } from '@/test/create-tester.js';
import { createSupplierFixture } from '@/test/domain-fixtures.js';
import { createActorUser, createAiContext } from '@/test/tools.js';
import { getSupplierDefinition, getSupplierTool } from './get-supplier.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);

  return { db };
});

const adminAccess = createUserAccessSummary({ role: 'admin', userId: 'test-user-id' });

describe('getSupplierTool', () => {
  test('is a supplier:read read tool', () => {
    expect(getSupplierTool.requiredPermission).toBe('supplier:read');
    expect(getSupplierDefinition.kind).toBe('read');
  });

  test('mirrors the suppliers.get result', async ({ context }) => {
    const created = await createSupplierFixture(context.db, 'Bolt Traders');

    const [toolResult, coreResult] = await Promise.all([
      getSupplierTool.handler({ id: created.id }, createAiContext(context.db, adminAccess)),
      core.getSupplier({ db: context.db, id: created.id }),
    ]);

    expect(toolResult).toEqual(coreResult);
  });

  test('surfaces the core not-found error for missing suppliers', async ({ context }) => {
    await expect(
      getSupplierTool.handler({ id: '00000000-0000-4000-8000-000000000001' }, createAiContext(context.db, adminAccess)),
    ).rejects.toThrow();
  });

  test('rejects invalid supplier get args', async ({ context }) => {
    await expect(
      getSupplierTool.handler({ id: 'bad-id' }, createAiContext(context.db, adminAccess)),
    ).rejects.toBeInstanceOf(z.ZodError);
  });
});
