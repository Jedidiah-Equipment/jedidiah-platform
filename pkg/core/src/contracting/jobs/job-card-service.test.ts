import type { JobCardModel } from '@pkg/schema/contracting';
import { describe, expect } from 'vitest';
import { createTester } from '../../test/create-tester.js';
import {
  adminId,
  completedJob,
  foremanId,
  invoicingId,
  type JobFixtures,
  leftStint,
  pricedJob,
  seedJobFixtures,
} from '../test/job-fixtures.js';
import { renderJobCard } from './job-card-service.js';
import { createJob } from './job-service.js';

const test = createTester(async ({ db }) => ({ ...(await seedJobFixtures(db)), db }) satisfies JobFixtures);

function capturingRenderer() {
  const documents: JobCardModel[] = [];
  return {
    documents,
    pdfRenderer: async ({ document }: { document: JobCardModel }) => {
      documents.push(document);
      return new Uint8Array([1, 2, 3]);
    },
  };
}

describe('rendering a Job Card', () => {
  test('renders a Priced Job for Invoicing, named for its Job Number and variant', async ({ context }) => {
    const priced = await pricedJob(context, [{ machineId: context.excavator.id, arrival: 100, departure: 110 }]);
    const { documents, pdfRenderer } = capturingRenderer();

    const result = await renderJobCard({
      db: context.db,
      actorUserId: invoicingId,
      mode: 'priced',
      code: priced.jobNumber,
      variant: 'customer',
      pdfRenderer,
    });

    expect(result).toEqual({
      bytes: new Uint8Array([1, 2, 3]),
      filename: `${priced.jobNumber}-job-card-customer.pdf`,
    });
    expect(documents[0]).toMatchObject({ variant: 'customer', status: 'priced', totals: { total: 6_000 } });
  });

  test('refuses Foremen, and an Active Job for anyone', async ({ context }) => {
    const completed = await completedJob(context, [{ machineId: context.excavator.id, arrival: 100, departure: 110 }]);
    const { pdfRenderer } = capturingRenderer();
    await expect(
      renderJobCard({
        db: context.db,
        actorUserId: foremanId,
        mode: 'own',
        code: completed.jobNumber,
        variant: 'customer',
        pdfRenderer,
      }),
    ).rejects.toMatchObject({ code: 'contracting_job.invalid_role' });

    const active = await createJob({
      db: context.db,
      actorUserId: adminId,
      input: {
        customerId: context.customer.id,
        farmId: context.farm.id,
        workTypeId: context.workType.id,
        description: null,
        foremanUserId: foremanId,
      },
    });
    await leftStint(context.db, active.id, context.tipper.id, 100, 104);
    await expect(
      renderJobCard({
        db: context.db,
        actorUserId: adminId,
        mode: 'all',
        code: active.jobNumber,
        variant: 'customer',
        pdfRenderer,
      }),
    ).rejects.toMatchObject({ code: 'contracting_job.wrong_status' });
    await expect(
      renderJobCard({
        db: context.db,
        actorUserId: invoicingId,
        mode: 'priced',
        code: active.jobNumber,
        variant: 'customer',
        pdfRenderer,
      }),
    ).rejects.toMatchObject({ code: 'contracting_job.not_owner' });
  });
});
