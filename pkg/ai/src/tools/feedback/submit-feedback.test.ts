import * as core from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect } from 'vitest';
import { z } from 'zod';
import { createTester } from '@/test/create-tester.js';
import { createJobFixture, createProductWithRangeFixture, createQuoteFixture } from '@/test/domain-fixtures.js';
import { createActorUser, createAiContext } from '@/test/tools.js';
import { submitFeedbackDefinition, submitFeedbackTool } from './submit-feedback.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);
  const product = await createProductWithRangeFixture(db, 'Submit Feedback Product');
  const quote = await createQuoteFixture(db, product.id, { status: 'accepted' });
  const job = await createJobFixture(db, quote.id);

  return { db, job };
});

const adminAccess = createUserAccessSummary({ role: 'admin', userId: 'test-user-id' });

describe('submitFeedbackTool', () => {
  test('is a session-only write tool', () => {
    expect(submitFeedbackTool.requiredPermission).toBeNull();
    expect(submitFeedbackDefinition.kind).toBe('write');
  });

  test('records general feedback against a Job', async ({ context }) => {
    const result = await submitFeedbackTool.handler(
      { subjectType: 'job', jobId: context.job.id, text: 'Panel needs rework' },
      createAiContext(context.db, adminAccess),
    );

    expect(result.id).toEqual(expect.any(String));

    const listed = await core.listJobFeedback({ db: context.db, input: { jobId: context.job.id } });
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]?.text).toBe('Panel needs rework');
  });

  test('rejects a job subject with no jobId', async ({ context }) => {
    await expect(
      submitFeedbackTool.handler(
        { subjectType: 'job', text: 'Missing target' },
        createAiContext(context.db, adminAccess),
      ),
    ).rejects.toBeInstanceOf(z.ZodError);
  });

  test('rejects a mismatched id instead of silently ignoring it', async ({ context }) => {
    await expect(
      submitFeedbackTool.handler(
        { subjectType: 'job', jobId: context.job.id, quoteId: context.job.id, text: 'Wrong target field' },
        createAiContext(context.db, adminAccess),
      ),
    ).rejects.toBeInstanceOf(z.ZodError);
  });
});
