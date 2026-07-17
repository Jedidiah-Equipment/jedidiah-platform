import { JobSummary } from '@pkg/schema';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';

import { BaySlotJobCard } from './BaySlotJobCard.js';

test('marks cancelled Job slots without hiding their identity', () => {
  const job = JobSummary.parse({
    cancelledAt: '2026-07-17T08:00:00.000Z',
    code: 'JOB-00001',
    createdAt: '2026-06-01T10:00:00.000Z',
    customerCompanyName: 'Acme Mining',
    customerId: '10000000-0000-4000-8000-000000000000',
    customerThumbnailDataUrl: null,
    description: null,
    id: '00000000-0000-4000-8000-000000000000',
    invoiceNumber: null,
    productBuildTimeDays: 12,
    productId: '20000000-0000-4000-8000-000000000000',
    productModelCode: 'MDL-1',
    productName: 'Loader Bucket',
    productSerialNumber: 'SN-2026-0001',
    productSerialPrefix: 'SN',
    productSerialSequence: 1,
    productSerialYear: 26,
    productThumbnailDataUrl: null,
    quoteCode: 'QUO-00001',
    quoteId: '30000000-0000-4000-8000-000000000000',
    quoteKind: 'product',
    scheduleState: null,
    updatedAt: '2026-06-01T10:00:00.000Z',
    vinNumber: null,
    workTitle: null,
  });

  const html = renderToStaticMarkup(
    <BaySlotJobCard dayBreakdown={{ closureDays: 0, overtimeDays: 0, workingDays: 2 }} job={job} jobCode={job.code} />,
  );

  expect(html).toContain('JOB-00001');
  expect(html).toContain('Cancelled');
});
