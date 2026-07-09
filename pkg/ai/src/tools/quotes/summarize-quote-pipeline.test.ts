import * as core from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { createActorUser, createAiContext } from '@/test/tools.js';
import { summarizeQuotePipelineDefinition, summarizeQuotePipelineTool } from './summarize-quote-pipeline.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);

  return { db };
});

const adminAccess = createUserAccessSummary({ role: 'admin', userId: 'test-user-id' });

describe('summarizeQuotePipelineTool', () => {
  test('is a quote:read read tool', () => {
    expect(summarizeQuotePipelineTool.requiredPermission).toBe('quote:read');
    expect(summarizeQuotePipelineDefinition.kind).toBe('read');
  });

  test('mirrors the quotes.pipelineSummary result unchanged', async ({ context }) => {
    const [toolResult, coreResult] = await Promise.all([
      summarizeQuotePipelineTool.handler({}, createAiContext(context.db, adminAccess)),
      core.summarizeQuotePipeline({ db: context.db }),
    ]);

    expect(toolResult).toEqual(coreResult);
    expect(summarizeQuotePipelineDefinition.projectResult(toolResult)).toEqual(toolResult);
  });
});
