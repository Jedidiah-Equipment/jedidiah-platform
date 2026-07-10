import { createUserAccessSummary } from '@pkg/domain';
import type { JobListResult } from '@pkg/schema';
import { describe, expect, test } from 'vitest';

import {
  FindJobsInput,
  FindJobsResponse,
  findJobsDefinition,
  toCoreJobListInput,
  toFindJobsResponse,
} from './find-jobs.js';

const JOB_ID = '00000000-0000-4000-8000-000000000401';
const CUSTOMER_ID = '00000000-0000-4000-8000-000000000101';
const QUOTE_ID = '00000000-0000-4000-8000-000000000301';

describe('findJobs v2 contract', () => {
  test('describes the lightweight find-before-get workflow', () => {
    expect(findJobsDefinition.name).toBe('findJobs');
    expect(findJobsDefinition.description).toContain('lightweight');
    expect(findJobsDefinition.description).toContain('getJob');
  });

  test('maps search onto an unpaged Job read', () => {
    const input = FindJobsInput.parse({ search: 'JOB-1' });

    expect(toCoreJobListInput(input)).toEqual({
      columnFilters: {},
      filters: {},
      page: 1,
      pageSize: 0,
      search: 'JOB-1',
      sortBy: 'code',
      sortDirection: 'asc',
    });
  });

  test('returns lightweight Custom Job identity and relationship fields', () => {
    const result = {
      items: [
        {
          code: 'JOB-00001',
          createdAt: '2026-07-10T08:00:00.000Z',
          customerCompanyName: 'Acme Mining',
          customerId: CUSTOMER_ID,
          description: 'Repair hydraulic leak',
          id: JOB_ID,
          productId: null,
          productModelCode: null,
          productName: null,
          productSerialNumber: null,
          quoteCode: 'QUO-00001',
          quoteId: QUOTE_ID,
          quoteKind: 'custom',
          workTitle: 'Hydraulic repair',
        },
      ],
    } as JobListResult;

    const response = toFindJobsResponse(result, createUserAccessSummary({ role: 'admin', userId: 'test-user-id' }));

    expect(FindJobsResponse.parse(response)).toEqual(response);
    expect(response).toEqual([
      {
        ...result.items[0],
        links: {
          app: `/jobs/${JOB_ID}`,
          customer: `/customers/${CUSTOMER_ID}/edit`,
          quote: `/quotes/${QUOTE_ID}/edit`,
        },
      },
    ]);
    expect(response[0]?.links).not.toHaveProperty('product');
    expect(
      toFindJobsResponse(result, createUserAccessSummary({ role: 'job-viewer', userId: 'test-user-id' }))[0]?.links,
    ).toEqual({ app: `/jobs/${JOB_ID}` });
  });
});
