import * as core from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import { FeedbackListInput } from '@pkg/schema';
import { describe, expect } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { createActorUser, createAiContext } from '@/test/tools.js';
import { listFeedbackDefinition, listFeedbackTool } from './list-feedback.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);

  return { db };
});

const adminAccess = createUserAccessSummary({ role: 'admin', userId: 'test-user-id' });

describe('listFeedbackTool', () => {
  test('is a feedback:read read tool', () => {
    expect(listFeedbackTool.requiredPermission).toBe('feedback:read');
    expect(listFeedbackDefinition.kind).toBe('read');
  });

  test('mirrors the feedback.list result', async ({ context }) => {
    const input = FeedbackListInput.parse({});

    const [toolResult, coreResult] = await Promise.all([
      listFeedbackTool.handler({}, createAiContext(context.db, adminAccess)),
      core.listFeedback({ db: context.db, input }),
    ]);

    expect(toolResult).toEqual(coreResult);
  });
});
