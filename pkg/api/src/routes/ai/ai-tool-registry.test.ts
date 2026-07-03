import { describe, expect, test } from 'vitest';

import { aiLinkMetadata } from './ai-link-metadata.js';
import { projectAiToolResult } from './ai-tool-registry.js';

describe('AI result projections', () => {
  test('adds Job and linked Quote and Customer metadata without mutating the base result', () => {
    const job = {
      id: '00000000-0000-4000-8000-000000000001',
      code: 'JOB-00001',
      customerCompanyName: 'Apex Quarry Services',
      customerId: '00000000-0000-4000-8000-000000000005',
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
        {
          entity: 'Customer',
          href: '/customers/00000000-0000-4000-8000-000000000005/edit',
          label: 'Apex Quarry Services',
        },
      ],
    });
    expect(job).not.toHaveProperty('links');
  });

  test('preserves Custom Job null product fields and Work Title fallback', () => {
    const result = {
      items: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          code: 'JOB-00001',
          customerCompanyName: 'Apex Quarry Services',
          customerId: '00000000-0000-4000-8000-000000000005',
          productModelCode: null,
          productName: null,
          productSerialNumber: null,
          quoteCode: 'QUO-00002',
          quoteId: '00000000-0000-4000-8000-000000000002',
          quoteKind: 'custom',
          workTitle: 'Hydraulic repair',
        },
      ],
      total: 1,
    };

    expect(projectAiToolResult('listJobs', result)).toEqual({
      ...result,
      items: [
        {
          ...result.items[0],
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
            {
              entity: 'Customer',
              href: '/customers/00000000-0000-4000-8000-000000000005/edit',
              label: 'Apex Quarry Services',
            },
          ],
        },
      ],
    });
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
          job: {
            jobCode: 'JOB-00004',
            jobId: '00000000-0000-4000-8000-000000000004',
          },
          documentNotes: '30% deposit, balance on delivery',
          plannedDeliveryDate: '2026-07-15',
          productId: '00000000-0000-4000-8000-000000000006',
          productModelCode: 'JED-SS-003',
          productName: 'Vertex Skid Steer 003',
          preferredDeliveryDate: '2026-07-10',
          quotedBasePrice: 100000,
          quotedCurrencyCode: 'ZAR',
          salesPersonId: 'test-user-id',
          sentAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      total: 1,
    };

    expect(projectAiToolResult('listQuotes', result)).toEqual({
      ...result,
      items: [
        {
          customerCompanyName: 'Apex Quarry Services',
          customerId: '00000000-0000-4000-8000-000000000005',
          id: '00000000-0000-4000-8000-000000000003',
          code: 'QUO-00003',
          job: {
            jobCode: 'JOB-00004',
            jobId: '00000000-0000-4000-8000-000000000004',
          },
          documentNotes: '30% deposit, balance on delivery',
          plannedDeliveryDate: '2026-07-15',
          productId: '00000000-0000-4000-8000-000000000006',
          productModelCode: 'JED-SS-003',
          productName: 'Vertex Skid Steer 003',
          preferredDeliveryDate: '2026-07-10',
          quotedBasePrice: 100000,
          quotedCurrencyCode: 'ZAR',
          salesPersonId: 'test-user-id',
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
    expect(projectAiToolResult('listQuotes', result)).not.toHaveProperty('items.0.sentAt');
  });

  test('adds Quote metadata to detail results without legacy sentAt', () => {
    const quote = {
      customerCompanyName: 'Apex Quarry Services',
      customerId: '00000000-0000-4000-8000-000000000005',
      id: '00000000-0000-4000-8000-000000000003',
      code: 'QUO-00003',
      documentNotes: '30% deposit, balance on delivery',
      plannedDeliveryDate: '2026-07-15',
      productId: '00000000-0000-4000-8000-000000000006',
      productName: 'Vertex Skid Steer 003',
      preferredDeliveryDate: '2026-07-10',
      quotedBasePrice: 100000,
      quotedCurrencyCode: 'ZAR',
      salesPersonId: 'test-user-id',
      sentAt: '2026-07-01T00:00:00.000Z',
    };

    expect(projectAiToolResult('getQuote', quote)).toEqual({
      customerCompanyName: 'Apex Quarry Services',
      customerId: '00000000-0000-4000-8000-000000000005',
      id: '00000000-0000-4000-8000-000000000003',
      code: 'QUO-00003',
      documentNotes: '30% deposit, balance on delivery',
      plannedDeliveryDate: '2026-07-15',
      productId: '00000000-0000-4000-8000-000000000006',
      productName: 'Vertex Skid Steer 003',
      preferredDeliveryDate: '2026-07-10',
      quotedBasePrice: 100000,
      quotedCurrencyCode: 'ZAR',
      salesPersonId: 'test-user-id',
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
      ],
    });
  });

  test('preserves Custom Quote null product fields and skips Product link', () => {
    const quote = {
      customerCompanyName: 'Apex Quarry Services',
      customerId: '00000000-0000-4000-8000-000000000005',
      id: '00000000-0000-4000-8000-000000000003',
      code: 'QUO-00003',
      documentNotes: '30% deposit, balance on delivery',
      job: null,
      kind: 'custom',
      lineItems: [{ name: 'Travel', quantity: 2, unitPrice: 150 }],
      plannedDeliveryDate: '2026-07-15',
      productId: null,
      productModelCode: null,
      productName: null,
      preferredDeliveryDate: '2026-07-10',
      quotedBasePrice: 2500,
      quotedCurrencyCode: 'ZAR',
      salesPersonId: 'test-user-id',
      selectedAssemblies: [],
      sentAt: '2026-07-01T00:00:00.000Z',
      workTitle: 'Hydraulic repair',
    };

    expect(projectAiToolResult('getQuote', quote)).toEqual({
      customerCompanyName: 'Apex Quarry Services',
      customerId: '00000000-0000-4000-8000-000000000005',
      id: '00000000-0000-4000-8000-000000000003',
      code: 'QUO-00003',
      documentNotes: '30% deposit, balance on delivery',
      job: null,
      kind: 'custom',
      lineItems: [{ name: 'Travel', quantity: 2, unitPrice: 150 }],
      plannedDeliveryDate: '2026-07-15',
      productId: null,
      productModelCode: null,
      productName: null,
      preferredDeliveryDate: '2026-07-10',
      quotedBasePrice: 2500,
      quotedCurrencyCode: 'ZAR',
      salesPersonId: 'test-user-id',
      selectedAssemblies: [],
      workTitle: 'Hydraulic repair',
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

  test('keeps non-linkable results as explicit identity projections', () => {
    const result = {
      items: [{ email: 'planner@example.com', id: 'user-id', name: 'Planner User' }],
      total: 1,
    };
    const partResult = {
      items: [
        {
          code: 'HOSE-001',
          id: 'part-id',
          isInternallyFabricated: true,
          name: 'Hydraulic hose',
          unitOfMeasure: 'mm',
        },
      ],
      total: 1,
    };

    expect(projectAiToolResult('listUsers', result)).toBe(result);
    expect(projectAiToolResult('listQuoteSalespeople', result)).toBe(result);
    expect(projectAiToolResult('listAuditEvents', result)).toBe(result);
    expect(projectAiToolResult('listParts', partResult)).toBe(partResult);
    expect(projectAiToolResult('getPart', partResult.items[0])).toBe(partResult.items[0]);
  });

  test('keeps CFO part units in Job detail projections', () => {
    const job = {
      id: '00000000-0000-4000-8000-000000000001',
      code: 'JOB-00001',
      cfo: [
        {
          assemblyName: 'Hydraulics',
          kind: 'standard',
          parts: [
            {
              partCode: 'HOSE-001',
              partId: '00000000-0000-4000-8000-000000000010',
              partName: 'Hydraulic hose',
              quantity: 6000,
              unitOfMeasure: 'mm',
            },
          ],
        },
      ],
    };

    expect(projectAiToolResult('getJob', job)).toMatchObject({
      cfo: [
        {
          parts: [
            {
              quantity: 6000,
              unitOfMeasure: 'mm',
            },
          ],
        },
      ],
    });
  });
});
