import { type JobSummary, JobSummary as JobSummarySchema } from '@pkg/schema/equipment';

/** A parsed {@link JobSummary} for board/list/calendar unit tests; pass `overrides` for the fields under test. */
export function buildJobSummary(overrides: Partial<Record<keyof JobSummary, unknown>> = {}): JobSummary {
  return JobSummarySchema.parse({
    cancellationReason: null,
    cancelledAt: null,
    code: 1,
    completedOn: null,
    createdAt: '2026-06-01T10:00:00.000Z',
    customerCompanyName: 'Acme Mining',
    customerId: '10000000-0000-4000-8000-000000000000',
    customerThumbnailDataUrl: null,
    description: null,
    id: '00000000-0000-4000-8000-000000000000',
    productBuildTimeDays: 12,
    productModelCode: 'MDL-1',
    productName: 'Loader Bucket',
    productThumbnailDataUrl: null,
    productUnit: {
      id: '40000000-0000-4000-8000-000000000000',
      productId: '20000000-0000-4000-8000-000000000000',
      productSerialNumber: 'SN-2026-0001',
      vinNumber: null,
    },
    quoteCode: 1,
    quoteId: '30000000-0000-4000-8000-000000000000',
    quoteKind: 'product',
    scheduleState: null,
    updatedAt: '2026-06-01T10:00:00.000Z',
    workTitle: null,
    ...overrides,
  });
}
