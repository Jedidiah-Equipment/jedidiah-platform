import * as core from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { createJobFixture, createProductWithRangeFixture, createQuoteFixture } from '@/test/domain-fixtures.js';
import { createActorUser, createAiContext } from '@/test/tools.js';
import { listJobFeedbackDefinition, listJobFeedbackTool } from './list-job-feedback.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);
  const product = await createProductWithRangeFixture(db, 'Feedback Product');
  const quote = await createQuoteFixture(db, product.id, { status: 'accepted' });
  const job = await createJobFixture(db, quote.id);

  return { db, job };
});

const adminAccess = createUserAccessSummary({ role: 'admin', userId: 'test-user-id' });

describe('listJobFeedbackTool', () => {
  test('is a job:read read tool', () => {
    expect(listJobFeedbackTool.requiredPermission).toBe('job:read');
    expect(listJobFeedbackDefinition.kind).toBe('read');
  });

  test('mirrors the feedback.listJobFeedback result', async ({ context }) => {
    await core.submitFeedback({
      db: context.db,
      input: { kind: 'general', subject: { subjectType: 'job', jobId: context.job.id }, text: 'Panel needs rework' },
      submitterId: 'test-user-id',
    });
    const input = { jobId: context.job.id };

    const [toolResult, coreResult] = await Promise.all([
      listJobFeedbackTool.handler(input, createAiContext(context.db, adminAccess)),
      core.listJobFeedback({ db: context.db, input }),
    ]);

    expect(toolResult).toEqual(coreResult);
    expect(toolResult.items).toHaveLength(1);
  });
});
