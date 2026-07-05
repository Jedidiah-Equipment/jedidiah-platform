import * as core from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect } from 'vitest';
import { z } from 'zod';
import { createTester } from '@/test/create-tester.js';
import { createPartFixture } from '@/test/domain-fixtures.js';
import { createActorUser, createAiContext } from '@/test/tools.js';
import { getPartDefinition, getPartTool } from './get-part.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);

  return { db };
});

describe('getPartTool', () => {
  test('returns the same part result shape as parts.get, including unitOfMeasure', async ({ context }) => {
    const created = await createPartFixture(context.db, {
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
      core.getPart({ db: context.db, id: created.id }),
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

  test('keeps Part detail results as explicit identity projections', () => {
    const part = {
      code: 'HOSE-001',
      id: 'part-id',
      isInternallyFabricated: true,
      name: 'Hydraulic hose',
      unitOfMeasure: 'mm',
    };

    expect((getPartDefinition.projectResult as (value: unknown) => unknown)(part)).toBe(part);
  });
});
