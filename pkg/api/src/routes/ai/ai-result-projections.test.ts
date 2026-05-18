import { describe, expect, test } from 'vitest';

import { aiLinkMetadata } from './ai-link-metadata.js';
import { projectAiToolResult } from './ai-result-projections.js';

describe('AI result projections', () => {
  test('adds Job and linked Quote metadata without mutating the base result', () => {
    const job = {
      id: '00000000-0000-4000-8000-000000000001',
      code: 'JOB-00001',
      quoteCode: 'QUO-00002',
      quoteId: '00000000-0000-4000-8000-000000000002',
    };

    const projected = projectAiToolResult('getJob', job);

    expect(projected).toEqual({
      ...job,
      links: [
        {
          entity: 'Job',
          href: '/jobs/00000000-0000-4000-8000-000000000001',
          label: 'JOB-00001',
        },
        {
          entity: 'Quote',
          href: '/quotes/00000000-0000-4000-8000-000000000002',
          label: 'QUO-00002',
        },
      ],
    });
    expect(job).not.toHaveProperty('links');
  });

  test('uses the shared route metadata for projected links', () => {
    expect(aiLinkMetadata.Job.href).toBe('/jobs/{id}');
    expect(projectAiToolResult('getJob', { code: 'JOB-00001', id: 'job-id' })).toMatchObject({
      links: [{ href: '/jobs/job-id' }],
    });
  });

  test('adds Quote and linked Job metadata to list items', () => {
    const result = {
      items: [
        {
          customerCompanyName: 'Apex Quarry Services',
          customerId: '00000000-0000-4000-8000-000000000005',
          id: '00000000-0000-4000-8000-000000000003',
          code: 'QUO-00003',
          jobCode: 'JOB-00004',
          jobId: '00000000-0000-4000-8000-000000000004',
          productId: '00000000-0000-4000-8000-000000000006',
          productModelCode: 'JED-SS-003',
          productName: 'Vertex Skid Steer 003',
        },
      ],
      total: 1,
    };

    expect(projectAiToolResult('listQuotes', result)).toEqual({
      ...result,
      items: [
        {
          ...result.items[0],
          links: [
            {
              entity: 'Quote',
              href: '/quotes/00000000-0000-4000-8000-000000000003',
              label: 'QUO-00003',
            },
            {
              entity: 'Customer',
              href: '/customers/00000000-0000-4000-8000-000000000005/edit',
              label: 'Apex Quarry Services',
            },
            {
              entity: 'Product',
              href: '/products/00000000-0000-4000-8000-000000000006/edit',
              label: 'Vertex Skid Steer 003',
            },
            {
              entity: 'Job',
              href: '/jobs/00000000-0000-4000-8000-000000000004',
              label: 'JOB-00004',
            },
          ],
        },
      ],
    });
  });

  test('adds Customer and Product metadata using public labels', () => {
    expect(
      projectAiToolResult('getCustomer', {
        companyName: 'Acme Mining',
        id: '00000000-0000-4000-8000-000000000005',
      }),
    ).toMatchObject({
      links: [
        {
          entity: 'Customer',
          href: '/customers/00000000-0000-4000-8000-000000000005/edit',
          label: 'Acme Mining',
        },
      ],
    });

    expect(
      projectAiToolResult('getProduct', {
        id: '00000000-0000-4000-8000-000000000006',
        name: 'Compact Loader',
      }),
    ).toMatchObject({
      links: [
        {
          entity: 'Product',
          href: '/products/00000000-0000-4000-8000-000000000006/edit',
          label: 'Compact Loader',
        },
      ],
    });
  });
});
