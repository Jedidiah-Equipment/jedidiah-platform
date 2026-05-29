import { createUserAccessSummary } from '@pkg/domain';
import type { Part } from '@pkg/schema';
import { describe, expect } from 'vitest';
import { z } from 'zod';

import { getPartTool } from '@/routes/ai/tools/get-part.js';
import { createActorUser, createAiContext } from '@/test/ai-tools.js';
import { type AppRouterCaller, createTester } from '@/test/create-tester.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);

  return { db };
});

describe('getPartTool', () => {
  test('returns the same part result shape as parts.get, including unitOfMeasure', async ({ context }) => {
    const caller = context.createCaller();
    const created = await createPart(caller, {
      code: 'HOSE-001',
      name: 'Hydraulic hose',
      unitOfMeasure: 'mm',
    });
    const access = createUserAccessSummary({
      role: 'admin',
      userId: 'test-user-id',
    });

    const [toolResult, trpcResult] = await Promise.all([
      getPartTool.handler({ id: created.id }, createAiContext(context.db, access)),
      caller.parts.get({ id: created.id }),
    ]);

    expect(toolResult).toEqual(trpcResult);
    expect(toolResult.unitOfMeasure).toBe('mm');
  });

  test('surfaces the core not-found message for missing parts', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'admin',
      userId: 'test-user-id',
    });

    await expect(
      getPartTool.handler(
        {
          id: '00000000-0000-4000-8000-000000000001',
        },
        createAiContext(context.db, access),
      ),
    ).rejects.toThrow('Part not found: 00000000-0000-4000-8000-000000000001');
  });

  test('rejects invalid part get args', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'admin',
      userId: 'test-user-id',
    });

    await expect(getPartTool.handler({ id: 'bad-id' }, createAiContext(context.db, access))).rejects.toBeInstanceOf(
      z.ZodError,
    );
  });
});

async function createPart(
  caller: AppRouterCaller,
  overrides: Partial<Parameters<AppRouterCaller['parts']['create']>[0]> = {},
): Promise<Part> {
  const supplier = await caller.suppliers.create({ companyName: `AI Part Supplier ${overrides.code ?? 'default'}` });

  return caller.parts.create({
    category: 'Hydraulics',
    code: 'PART-001',
    description: 'Hydraulic hose',
    drawingCode: null,
    finish: 'Rubber',
    name: 'Hydraulic hose',
    supplierCode: 'SUP-PART-001',
    supplierId: supplier.id,
    unitOfMeasure: 'quantity',
    ...overrides,
  });
}
