import * as core from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { createProductWithRangeFixture, createQuoteFixture } from '@/test/domain-fixtures.js';
import { createActorUser, createAiContext } from '@/test/tools.js';
import { listQuoteDocumentsDefinition, listQuoteDocumentsTool } from './list-quote-documents.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);
  const product = await createProductWithRangeFixture(db, 'Quote Document Product');
  const quote = await createQuoteFixture(db, product.id);

  return { db, quote };
});

const adminAccess = createUserAccessSummary({ role: 'admin', userId: 'test-user-id' });

describe('listQuoteDocumentsTool', () => {
  test('is a quote:read read tool', () => {
    expect(listQuoteDocumentsTool.requiredPermission).toBe('quote:read');
    expect(listQuoteDocumentsDefinition.kind).toBe('read');
  });

  test('mirrors the documents.listByQuote result', async ({ context }) => {
    const [toolResult, coreResult] = await Promise.all([
      listQuoteDocumentsTool.handler({ quoteId: context.quote.id }, createAiContext(context.db, adminAccess)),
      core.getQuoteDocuments({ db: context.db, quoteId: context.quote.id }),
    ]);

    expect(toolResult).toEqual(coreResult);
  });
});
