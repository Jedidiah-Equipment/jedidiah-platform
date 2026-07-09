import * as core from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { createActorUser, createAiContext } from '@/test/tools.js';
import { summarizeQuoteWeeklyFlowDefinition, summarizeQuoteWeeklyFlowTool } from './summarize-quote-weekly-flow.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);

  return { db };
});

const adminAccess = createUserAccessSummary({ role: 'admin', userId: 'test-user-id' });

describe('summarizeQuoteWeeklyFlowTool', () => {
  test('is a quote:read read tool', () => {
    expect(summarizeQuoteWeeklyFlowTool.requiredPermission).toBe('quote:read');
    expect(summarizeQuoteWeeklyFlowDefinition.kind).toBe('read');
  });

  test('mirrors the quotes.weeklyFlow result unchanged', async ({ context }) => {
    const [toolResult, coreResult] = await Promise.all([
      summarizeQuoteWeeklyFlowTool.handler({}, createAiContext(context.db, adminAccess)),
      core.summarizeQuoteWeeklyFlow({ db: context.db }),
    ]);

    expect(toolResult).toEqual(coreResult);
    expect(summarizeQuoteWeeklyFlowDefinition.projectResult(toolResult)).toEqual(toolResult);
  });
});
