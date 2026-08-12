import { createUserAccessSummary } from '@pkg/domain';
import { JobDetail } from '@pkg/schema';
import { describe, expect, test } from 'vitest';

import { GetJobInput, GetJobResponse, getJobDefinition, toGetJobResponse } from './get-job.js';

const JOB_ID = '00000000-0000-4000-8000-000000000401';
const CUSTOMER_ID = '00000000-0000-4000-8000-000000000101';
const QUOTE_ID = '00000000-0000-4000-8000-000000000301';
const UNIT_ID = '00000000-0000-4000-8000-000000000201';
const PRODUCT_ID = '00000000-0000-4000-8000-000000000202';

const job = JobDetail.parse({
  cancellationReason: null,
  cancelledAt: null,
  cfo: [],
  code: 'JOB-00001',
  completedOn: null,
  createdAt: '2026-07-10T08:00:00.000Z',
  customerCompanyName: 'Acme Mining',
  customerId: CUSTOMER_ID,
  customerThumbnailDataUrl: 'data:image/webp;base64,YQ==',
  description: 'Repair hydraulic leak',
  documents: [],
  id: JOB_ID,
  productBuildTimeDays: null,
  productModelCode: null,
  productName: null,
  productThumbnailDataUrl: null,
  productUnit: null,
  quoteCode: 'QUO-00001',
  quoteId: QUOTE_ID,
  quoteKind: 'custom',
  schedule: ['procurement', 'supply', 'fabrication', 'paint', 'assembly', 'workshop'].map((department) => ({
    bays: [],
    department,
  })),
  scheduleState: null,
  updatedAt: '2026-07-10T09:00:00.000Z',
  workRows: [
    {
      id: '00000000-0000-4000-8000-000000000501',
      department: 'assembly',
      description: 'Strip pump assembly',
      hours: 1.5,
      name: 'Assembly',
    },
    {
      id: '00000000-0000-4000-8000-000000000502',
      department: null,
      description: null,
      hours: 0,
      name: 'Install replacement pump',
    },
  ],
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
      cancelledAt: null,
      code: 'JOB-00001',
      description: 'Repair hydraulic leak',
      id: JOB_ID,
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
        { department: 'workshop' },
      ],
      workRows: [{ name: 'Assembly' }, { name: 'Install replacement pump' }],
      workTitle: 'Hydraulic repair',
    });
    expect(JSON.stringify(response)).not.toContain('thumbnailDataUrl');
    expect(
      toGetJobResponse(job, createUserAccessSummary({ role: 'job-viewer', userId: 'test-user-id' })).links,
    ).toEqual({ app: `/jobs/${JOB_ID}` });
  });

  test('links a Unit-bound Job to the machine it builds', () => {
    const productJob = JobDetail.parse({
      ...job,
      productUnit: {
        id: UNIT_ID,
        productId: PRODUCT_ID,
        productSerialNumber: 'SG1836260009',
        vinNumber: null,
      },
    });

    const response = toGetJobResponse(productJob, createUserAccessSummary({ role: 'admin', userId: 'test-user-id' }));

    expect(response.productUnit).toMatchObject({ id: UNIT_ID, productSerialNumber: 'SG1836260009' });
    expect(response.links).toMatchObject({
      product: `/products/${PRODUCT_ID}/edit`,
      productUnit: `/units/${UNIT_ID}`,
    });
  });
});
