import type { Db } from '@pkg/db';
import { accessForRole } from '@pkg/domain/testing';
import type { UserAccessSummary } from '@pkg/schema';
import { type NoteThreadKind, noteThreadKinds } from '@pkg/schema/contracting';
import { describe, expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import { reportBreakdown } from '../breakdowns/breakdown-service.js';
import { createJob } from '../jobs/job-service.js';
import { admin, foreman, foremanId, invoicing, seedJobFixtures } from '../test/job-fixtures.js';
import { addNote } from './note-service.js';

const test = createTester(async ({ db }) => seedJobFixtures(db));

type Fixtures = Awaited<ReturnType<typeof seedJobFixtures>> & { db: Db };

const MISSING = '00000000-0000-4000-8000-000000000001';

/** Each kind's record, opened with the fixture Foreman taking part, and who its own gate refuses. */
const threads: Record<
  NoteThreadKind,
  {
    open: (fixtures: Fixtures) => Promise<string>;
    threadKey: string;
    outsider: UserAccessSummary;
    refused: string;
    notFound: string;
  }
> = {
  job: {
    open: async ({ db, customer, farm, workType }) => {
      const job = await createJob({
        db,
        actor: admin,
        input: {
          customerId: customer.id,
          farmId: farm.id,
          workTypeId: workType.id,
          description: null,
          foremanUserId: foremanId,
        },
      });
      return job.id;
    },
    threadKey: 'jobId',
    // Invoicing reads only Completed-onward Jobs.
    outsider: invoicing,
    refused: 'contracting_job.forbidden',
    notFound: 'contracting_job.not_found',
  },
  breakdown: {
    open: async ({ db, excavator }) => {
      const { breakdown } = await reportBreakdown({
        db,
        actor: foreman,
        input: {
          subject: { kind: 'machine', id: excavator.id },
          urgency: 'code-green',
          description: 'Leak',
          jobId: null,
        },
      });
      return breakdown.id;
    },
    threadKey: 'breakdownId',
    // Reporting lets a Foreman note only a Breakdown that is theirs.
    outsider: accessForRole('foreman', 'thabo'),
    refused: 'breakdown.forbidden',
    notFound: 'breakdown.not_found',
  },
};

describe.each(noteThreadKinds)('a %s Note Thread', (kind) => {
  const thread = threads[kind];

  test('appends an entry with its author and thread in the kind’s record shape', async ({ context }) => {
    const id = await thread.open(context);

    const note = await addNote({
      db: context.db,
      actor: foreman,
      thread: kind,
      input: { id, text: '  Gate code  ' },
    });

    expect(note).toMatchObject({
      [thread.threadKey]: id,
      authorUserId: foremanId,
      authorName: 'Sipho',
      text: 'Gate code',
    });
  });

  test('refuses under its record’s own gate', async ({ context }) => {
    const id = await thread.open(context);

    await expect(
      addNote({ db: context.db, actor: thread.outsider, thread: kind, input: { id, text: 'Hello' } }),
    ).rejects.toMatchObject({ code: thread.refused });
  });

  test('refuses a missing record with its record’s not-found', async ({ context: { db } }) => {
    await expect(
      addNote({ db, actor: admin, thread: kind, input: { id: MISSING, text: 'Hello' } }),
    ).rejects.toMatchObject({ code: thread.notFound });
  });
});
