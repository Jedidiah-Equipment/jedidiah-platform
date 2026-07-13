import { createUserAccessSummary } from '@pkg/domain';
import { JobDetail } from '@pkg/schema';
import { describe, expect, test } from 'vitest';

import { GetJobInput, GetJobResponse, getJobDefinition, toGetJobResponse } from './get-job.js';

const JOB_ID = '00000000-0000-4000-8000-000000000401';
const CUSTOMER_ID = '00000000-0000-4000-8000-000000000101';
const QUOTE_ID = '00000000-0000-4000-8000-000000000301';

const job = JobDetail.parse({
  cfo: [],
  code: 'JOB-00001',
  createdAt: '2026-07-10T08:00:00.000Z',
  customerCompanyName: 'Acme Mining',
  customerId: CUSTOMER_ID,
  customerThumbnailDataUrl: 'data:image/webp;base64,YQ==',
  description: 'Repair hydraulic leak',
  documents: [],
  id: JOB_ID,
  productBuildTimeDays: null,
  invoiceNumber: 'INV-1001',
  productId: null,
  productModelCode: null,
  productName: null,
  productSerialNumber: null,
  productSerialPrefix: null,
  productSerialSequence: null,
  productSerialYear: null,
  productThumbnailDataUrl: null,
  quoteCode: 'QUO-00001',
  quoteId: QUOTE_ID,
  quoteKind: 'custom',
  schedule: ['procurement', 'supply', 'fabrication', 'paint', 'assembly'].map((department) => ({
    bays: [],
    department,
  })),
  scheduleState: null,
  updatedAt: '2026-07-10T09:00:00.000Z',
  vinNumber: null,
  workTitle: 'Hydraulic repair',
});

describe('getJob contract', () => {
  test('requires a Job UUID and describes the find follow-up', () => {
    expect(GetJobInput.parse({ id: JOB_ID })).toEqual({ id: JOB_ID });
    expect(() => GetJobInput.parse({ id: 'bad-id' })).toThrow();
    expect(getJobDefinition.description).toContain('findJobs');
  });

  test('returns full Job details and relationships without thumbnail data', () => {
    const response = toGetJobResponse(job, createUserAccessSummary({ role: 'admin', userId: 'test-user-id' }));

    expect(GetJobResponse.parse(response)).toEqual(response);
    expect(response).toMatchObject({
      code: 'JOB-00001',
      description: 'Repair hydraulic leak',
      id: JOB_ID,
      invoiceNumber: 'INV-1001',
      links: {
        app: `/jobs/${JOB_ID}`,
        customer: `/customers/${CUSTOMER_ID}/edit`,
        quote: `/quotes/${QUOTE_ID}/edit`,
      },
      schedule: [
        { department: 'procurement' },
        { department: 'supply' },
        { department: 'fabrication' },
        { department: 'paint' },
        { department: 'assembly' },
      ],
      workTitle: 'Hydraulic repair',
    });
    expect(JSON.stringify(response)).not.toContain('thumbnailDataUrl');
    expect(
      toGetJobResponse(job, createUserAccessSummary({ role: 'job-viewer', userId: 'test-user-id' })).links,
    ).toEqual({ app: `/jobs/${JOB_ID}` });
  });
});
