import * as core from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import { SupplierListInput } from '@pkg/schema';
import { describe, expect } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { createSupplierFixture } from '@/test/domain-fixtures.js';
import { createActorUser, createAiContext } from '@/test/tools.js';
import { listSuppliersDefinition, listSuppliersTool } from './list-suppliers.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);
  await createSupplierFixture(db, 'Bolt Traders');

  return { db };
});

const adminAccess = createUserAccessSummary({ role: 'admin', userId: 'test-user-id' });

describe('listSuppliersTool', () => {
  test('is a supplier:read read tool', () => {
    expect(listSuppliersTool.requiredPermission).toBe('supplier:read');
    expect(listSuppliersDefinition.kind).toBe('read');
  });

  test('mirrors the suppliers.list result', async ({ context }) => {
    const input = SupplierListInput.parse({});

    const [toolResult, coreResult] = await Promise.all([
      listSuppliersTool.handler({}, createAiContext(context.db, adminAccess)),
      core.listSuppliers({ db: context.db, input }),
    ]);

    expect(toolResult).toEqual(coreResult);
  });

  test('projects Suppliers without thumbnails or links', () => {
    const project = listSuppliersDefinition.projectResult as (value: unknown) => {
      items: Array<Record<string, unknown>>;
    };

    const projected = project({
      items: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          companyName: 'Bolt Traders',
          email: 'bolt@example.com',
          address: '2 Supply Lane',
          contactPerson: 'Sam Supplier',
          phone: '+27110000000',
          notes: null,
          thumbnailDataUrl: 'data:image/webp;base64,aaaa',
          createdAt: '2026-06-17T08:00:00.000Z',
          updatedAt: '2026-06-17T08:00:00.000Z',
        },
      ],
      total: 1,
    });

    expect(projected.items[0]).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      companyName: 'Bolt Traders',
      email: 'bolt@example.com',
      address: '2 Supply Lane',
      contactPerson: 'Sam Supplier',
      phone: '+27110000000',
      notes: null,
    });
    expect(projected.items[0]).not.toHaveProperty('links');
  });
});
