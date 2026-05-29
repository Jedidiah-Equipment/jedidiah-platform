import * as core from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import type { Part, PartListInput } from '@pkg/schema';
import { describe, expect, vi } from 'vitest';
import { z } from 'zod';

import { listPartsTool } from '@/routes/ai/tools/list-parts.js';
import { createActorUser, createAiContext } from '@/test/ai-tools.js';
import { type AppRouterCaller, createTester } from '@/test/create-tester.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);

  return { db };
});

describe('listPartsTool', () => {
  test('returns the same part list result shape as parts.list, including unitOfMeasure', async ({ context }) => {
    const caller = context.createCaller();
    await createPart(caller, {
      code: 'BOLT-001',
      name: 'Mounting bolt',
      supplierCode: 'SUP-BOLT-001',
      unitOfMeasure: 'quantity',
    });
    await createPart(caller, {
      code: 'HOSE-001',
      name: 'Hydraulic hose',
      supplierCode: 'SUP-HOSE-001',
      unitOfMeasure: 'mm',
    });
    const input: PartListInput = {
      columnFilters: {
        unitOfMeasure: 'mm',
      },
      page: 1,
      pageSize: 10,
      search: 'hose',
      sortBy: 'name',
      sortDirection: 'asc',
    };
    const access = createUserAccessSummary({
      role: 'admin',
      userId: 'test-user-id',
    });

    const [toolResult, trpcResult] = await Promise.all([
      listPartsTool.handler(input, createAiContext(context.db, access)),
      caller.parts.list(input),
    ]);

    expect(toolResult).toEqual(trpcResult);
    expect(toolResult.items).toEqual([expect.objectContaining({ code: 'HOSE-001', unitOfMeasure: 'mm' })]);
  });

  test('treats null tool args as the default part list input', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'admin',
      userId: 'test-user-id',
    });
    const listPartsSpy = vi.spyOn(core, 'listParts').mockResolvedValue({
      items: [],
      sortBy: 'name',
      sortDirection: 'asc',
      total: 0,
    });

    try {
      await listPartsTool.handler(null, createAiContext(context.db, access));

      expect(listPartsSpy).toHaveBeenCalledWith({
        db: context.db,
        input: expect.objectContaining({
          page: 1,
          pageSize: 10,
          search: '',
          sortBy: 'name',
          sortDirection: 'asc',
        }),
      });
    } finally {
      listPartsSpy.mockRestore();
    }
  });

  test('rejects invalid part list args', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'admin',
      userId: 'test-user-id',
    });

    await expect(
      listPartsTool.handler(
        {
          sortBy: 'bad-sort',
        },
        createAiContext(context.db, access),
      ),
    ).rejects.toBeInstanceOf(z.ZodError);
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
    isInternallyFabricated: false,
    name: 'Hydraulic hose',
    supplierCode: 'SUP-PART-001',
    supplierId: supplier.id,
    unitOfMeasure: 'quantity',
    ...overrides,
  });
}
