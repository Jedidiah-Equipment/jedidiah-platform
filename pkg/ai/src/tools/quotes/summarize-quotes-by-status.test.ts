import * as core from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { createActorUser, createAiContext } from '@/test/tools.js';
import { summarizeQuotesByStatusDefinition, summarizeQuotesByStatusTool } from './summarize-quotes-by-status.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);

  return { db };
});

const adminAccess = createUserAccessSummary({ role: 'admin', userId: 'test-user-id' });

describe('summarizeQuotesByStatusTool', () => {
  test('is a quote:read read tool', () => {
    expect(summarizeQuotesByStatusTool.requiredPermission).toBe('quote:read');
    expect(summarizeQuotesByStatusDefinition.kind).toBe('read');
  });

  test('mirrors the quotes.summaryByStatus result unchanged', async ({ context }) => {
    const [toolResult, coreResult] = await Promise.all([
      summarizeQuotesByStatusTool.handler({}, createAiContext(context.db, adminAccess)),
      core.summarizeQuotesByStatus({ db: context.db }),
    ]);

    expect(toolResult).toEqual(coreResult);
    expect(summarizeQuotesByStatusDefinition.projectResult(toolResult)).toEqual(toolResult);
  });
});
