import * as core from '@pkg/core';
import type { JobDetail, UserAccessSummary } from '@pkg/schema';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { AiContext } from '@/context.js';
import { createSilentLogger, mockSession } from '@/test/test-utils.js';
import { createJobFromQuoteDefinition, createJobFromQuoteTool } from './create-job-from-quote.js';

const brochureRenderer = vi.fn(async () => new Uint8Array());
const storage = {} as AiContext['storage'];

function createAiContext(access: UserAccessSummary | null = null): AiContext {
  return {
    access,
    brochureRenderer,
    db: {} as AiContext['db'],
    deliverQuoteDraftEmail: vi.fn(async () => ({ recipientEmail: 'test@example.com', warnings: [] })),
    log: createSilentLogger(),
    session: mockSession(access?.role ?? 'admin'),
    storage,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createJobFromQuoteTool', () => {
  test('is a job:create write tool', () => {
    expect(createJobFromQuoteTool.requiredPermission).toBe('job:create');
    expect(createJobFromQuoteDefinition.kind).toBe('write');
  });

  test('injects the brochure renderer and storage from the AiContext', async () => {
    const createJobSpy = vi
      .spyOn(core, 'createJob')
      .mockResolvedValue({ id: 'job-id', code: 'JOB-00001' } as unknown as JobDetail);

    await createJobFromQuoteTool.handler({ quoteId: '00000000-0000-4000-8000-000000000301' }, createAiContext());

    expect(createJobSpy).toHaveBeenCalledWith({
      actorUserId: 'test-user-id',
      brochureRenderer,
      db: expect.any(Object),
      input: { baySeeds: [], quoteId: '00000000-0000-4000-8000-000000000301' },
      storage,
    });
  });

  test('projects the created Job with a Job link', () => {
    expect(
      (createJobFromQuoteDefinition.projectResult as (value: unknown) => unknown)({
        id: '00000000-0000-4000-8000-000000000001',
        code: 'JOB-00001',
      }),
    ).toMatchObject({
      links: [{ entity: 'Job', href: '/jobs/00000000-0000-4000-8000-000000000001', label: 'JOB-00001' }],
    });
  });
});
