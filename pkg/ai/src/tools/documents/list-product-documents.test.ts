import * as core from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { createProductWithRangeFixture } from '@/test/domain-fixtures.js';
import { createActorUser, createAiContext } from '@/test/tools.js';
import { listProductDocumentsDefinition, listProductDocumentsTool } from './list-product-documents.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);
  const product = await createProductWithRangeFixture(db, 'Document Product');

  return { db, product };
});

const adminAccess = createUserAccessSummary({ role: 'admin', userId: 'test-user-id' });

describe('listProductDocumentsTool', () => {
  test('is a product:read read tool', () => {
    expect(listProductDocumentsTool.requiredPermission).toBe('product:read');
    expect(listProductDocumentsDefinition.kind).toBe('read');
  });

  test('mirrors the documents.listByProduct result', async ({ context }) => {
    const [toolResult, coreResult] = await Promise.all([
      listProductDocumentsTool.handler({ productId: context.product.id }, createAiContext(context.db, adminAccess)),
      core.getProductDocuments({ db: context.db, productId: context.product.id }),
    ]);

    expect(toolResult).toEqual(coreResult);
  });

  test('projects a document list to id, filename, type, and created date', () => {
    const project = listProductDocumentsDefinition.projectResult as (value: unknown) => unknown;

    expect(
      project([
        {
          id: '00000000-0000-4000-8000-000000000001',
          ownerType: 'product',
          productId: '00000000-0000-4000-8000-000000000009',
          filename: 'sop.pdf',
          contentType: 'application/pdf',
          byteSize: 1024,
          metadata: { type: 'sop' },
          uploaderUserId: 'test-user-id',
          uploaderName: 'Test User',
          uploaderEmail: 'test@example.com',
          createdAt: '2026-06-17T08:00:00.000Z',
        },
      ]),
    ).toEqual([
      {
        id: '00000000-0000-4000-8000-000000000001',
        filename: 'sop.pdf',
        contentType: 'application/pdf',
        metadata: { type: 'sop' },
        createdAt: '2026-06-17T08:00:00.000Z',
      },
    ]);
  });
});
