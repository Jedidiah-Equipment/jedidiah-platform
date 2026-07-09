import { describe, expect, test } from 'vitest';

import {
  prepareAiToolResultForModel,
  projectAuditEventList,
  projectBaySchedule,
  projectCustomerListItem,
  projectDocumentList,
  projectJobDetail,
  projectJobListItem,
  projectPagedItems,
  projectProductListItem,
  projectQuoteDetail,
  projectQuoteListItem,
  projectQuoteSalespeople,
  projectStaleSentQuotes,
  projectSupplier,
  projectUserList,
} from './projections.js';

describe('tool result projections', () => {
  test('removes thumbnail data URLs at any nesting depth before results reach the model', () => {
    const result = prepareAiToolResultForModel({
      customerThumbnailDataUrl: 'data:image/png;base64,customer',
      id: 'customer-id',
      nested: {
        keep: 'value',
        productThumbnailDataUrl: 'data:image/png;base64,product',
      },
      users: [
        {
          name: 'Planner User',
          thumbnailDataUrl: 'data:image/png;base64,user',
        },
      ],
    });

    expect(JSON.stringify(result.result)).not.toContain('thumbnailDataUrl');
    expect(result.result).toEqual({
      id: 'customer-id',
      nested: {
        keep: 'value',
      },
      users: [
        {
          name: 'Planner User',
        },
      ],
    });
    expect(result.size).toMatchObject({
      removedThumbnailFieldsByFallback: 3,
      truncated: false,
    });
  });

  test('slims Job detail schedules to the target Job work slots', () => {
    const projected = projectJobDetail({
      code: 'JOB-00001',
      id: '00000000-0000-4000-8000-000000000001',
      schedule: [
        {
          bays: [
            {
              currentOperator: {
                id: 'operator-id',
                name: 'Operator',
                thumbnailDataUrl: 'data:image/png;base64,operator',
              },
              id: 'bay-1',
              slots: [
                {
                  dayBreakdown: {
                    closureDays: 1,
                    overtimeDays: 1,
                    workingDays: 3,
                  },
                  jobCode: 'JOB-00001',
                  jobId: '00000000-0000-4000-8000-000000000001',
                  kind: 'work',
                  operator: {
                    email: 'operator@example.com',
                    id: 'operator-id',
                    name: 'Operator',
                    thumbnailDataUrl: 'data:image/png;base64,operator-slot',
                  },
                },
                {
                  jobCode: 'JOB-00002',
                  jobId: '00000000-0000-4000-8000-000000000002',
                  kind: 'work',
                },
                {
                  jobId: null,
                  kind: 'idle',
                },
              ],
            },
            {
              id: 'bay-2',
              slots: [
                {
                  jobCode: 'JOB-00003',
                  jobId: '00000000-0000-4000-8000-000000000003',
                  kind: 'work',
                },
              ],
            },
          ],
          department: 'fabrication',
        },
      ],
    });

    expect(projected).toMatchObject({
      schedule: [
        {
          bays: [
            {
              currentOperator: {
                id: 'operator-id',
                name: 'Operator',
              },
              id: 'bay-1',
              slots: [
                {
                  dayBreakdown: {
                    closureDays: 1,
                    overtimeDays: 1,
                    workingDays: 3,
                  },
                  jobCode: 'JOB-00001',
                  jobId: '00000000-0000-4000-8000-000000000001',
                  kind: 'work',
                  operator: {
                    email: 'operator@example.com',
                    id: 'operator-id',
                    name: 'Operator',
                  },
                },
              ],
            },
          ],
          department: 'fabrication',
        },
      ],
    });
    expect(JSON.stringify(projected)).not.toContain('thumbnailDataUrl');
  });

  test('removes sort echoes from paged list projections while keeping sortable timestamps', () => {
    const customerResult = projectPagedItems(
      {
        items: [
          {
            address: 'Hidden list address',
            companyName: 'Apex Quarry Services',
            createdAt: '2026-07-01T00:00:00.000Z',
            email: 'buyer@apex.example',
            id: '00000000-0000-4000-8000-000000000101',
            sortOnly: true,
            updatedAt: '2026-07-01T00:00:00.000Z',
            vatNumber: 'VAT-123',
          },
        ],
        sortBy: 'companyName',
        sortDirection: 'asc',
        total: 1,
      },
      projectCustomerListItem,
    );
    const quoteResult = projectPagedItems(
      {
        items: [
          {
            code: 'QUO-00001',
            createdAt: '2026-07-01T00:00:00.000Z',
            customerCompanyName: 'Apex Quarry Services',
            customerId: '00000000-0000-4000-8000-000000000101',
            id: '00000000-0000-4000-8000-000000000201',
            lineItems: [{ name: 'Freight', quantity: 1, unitPrice: 1000 }],
            notes: 'Internal follow-up note',
            selectedAssemblies: [{ quotedName: 'Hydraulics', quotedPrice: 2000 }],
            sortOnly: true,
            updatedAt: '2026-07-01T00:00:00.000Z',
          },
        ],
        sortBy: 'createdAt',
        sortDirection: 'desc',
        total: 1,
      },
      projectQuoteListItem,
    );

    expect(customerResult).toMatchObject({ items: [expect.any(Object)], total: 1 });
    expect(customerResult).not.toHaveProperty('sortBy');
    expect(customerResult).not.toHaveProperty('sortDirection');
    expect(JSON.stringify(customerResult)).not.toContain('Hidden list address');
    expect(JSON.stringify(customerResult)).toContain('createdAt');
    expect(quoteResult).toMatchObject({ items: [expect.any(Object)], total: 1 });
    expect(quoteResult).not.toHaveProperty('sortBy');
    expect(quoteResult).not.toHaveProperty('sortDirection');
    expect(JSON.stringify(quoteResult)).not.toContain('lineItems');
    expect(JSON.stringify(quoteResult)).not.toContain('selectedAssemblies');
    expect(JSON.stringify(quoteResult)).not.toContain('Internal follow-up note');
    expect(JSON.stringify(quoteResult)).toContain('createdAt');
  });

  test('slims Product list rows to catalog reasoning facts', () => {
    const projected = projectProductListItem({
      assemblies: [
        {
          createdAt: '2026-07-01T00:00:00.000Z',
          id: '00000000-0000-4000-8000-000000000301',
          kind: 'optional',
          name: 'Hydraulics',
          parts: [{ partId: 'part-id', quantity: 2 }],
          price: 5000,
          productId: '00000000-0000-4000-8000-000000000001',
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      basePrice: 100000,
      brochureEnabled: true,
      buildTimeDays: 14,
      createdAt: '2026-07-01T00:00:00.000Z',
      currencyCode: 'ZAR',
      id: '00000000-0000-4000-8000-000000000001',
      images: { primary: { filename: 'loader.webp' } },
      modelCode: 'CL-100',
      name: 'Compact Loader',
      productBays: [
        {
          bay: {
            calendarExceptions: [{ date: '2026-07-10' }],
            createdAt: '2026-07-01T00:00:00.000Z',
            department: 'fabrication',
            disabledAt: null,
            id: '00000000-0000-4000-8000-000000000401',
            name: 'Fab Bay',
            scheduleOrigin: '2026-07-01',
            updatedAt: '2026-07-01T00:00:00.000Z',
          },
          bayId: '00000000-0000-4000-8000-000000000401',
          defaultWorkingDays: 5,
          productId: '00000000-0000-4000-8000-000000000001',
        },
      ],
      rangeId: '00000000-0000-4000-8000-000000000501',
      thumbnailDataUrl: 'data:image/webp;base64,aaaa',
      updatedAt: '2026-07-01T00:00:00.000Z',
    });

    expect(projected).toMatchObject({
      assemblies: [
        {
          id: '00000000-0000-4000-8000-000000000301',
          kind: 'optional',
          name: 'Hydraulics',
          parts: [{ partId: 'part-id', quantity: 2 }],
          price: 5000,
        },
      ],
      basePrice: 100000,
      buildTimeDays: 14,
      currencyCode: 'ZAR',
      createdAt: '2026-07-01T00:00:00.000Z',
      id: '00000000-0000-4000-8000-000000000001',
      modelCode: 'CL-100',
      name: 'Compact Loader',
      productBays: [
        {
          bay: {
            department: 'fabrication',
            id: '00000000-0000-4000-8000-000000000401',
            name: 'Fab Bay',
          },
          defaultWorkingDays: 5,
        },
      ],
    });
    expect(JSON.stringify(projected)).not.toContain('thumbnailDataUrl');
    expect(JSON.stringify(projected)).not.toContain('images');
    expect(JSON.stringify(projected)).not.toContain('productId');
    expect(JSON.stringify(projected)).not.toContain('updatedAt');
  });

  test('keeps Quote detail commercial inputs that Quote lists omit', () => {
    const quote = {
      code: 'QUO-00001',
      createdAt: '2026-07-01T00:00:00.000Z',
      customerCompanyName: 'Apex Quarry Services',
      customerEmail: 'buyer@apex.example',
      customerId: '00000000-0000-4000-8000-000000000101',
      id: '00000000-0000-4000-8000-000000000201',
      lineItems: [
        {
          createdAt: '2026-07-01T00:00:00.000Z',
          id: '00000000-0000-4000-8000-000000000301',
          name: 'Freight',
          quantity: 1,
          quoteId: '00000000-0000-4000-8000-000000000201',
          unitPrice: 1000,
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      product: {
        assemblies: [
          {
            id: '00000000-0000-4000-8000-000000000401',
            kind: 'optional',
            name: 'Hydraulics',
            parts: [{ partId: 'part-id', quantity: 2 }],
            price: 5000,
            productId: '00000000-0000-4000-8000-000000000501',
          },
        ],
        buildTimeDays: 14,
        currencyCode: 'ZAR',
        description: 'Demo product',
        modelCode: 'CL-100',
        name: 'Compact Loader',
        requiresVinNumber: false,
        thumbnailDataUrl: null,
      },
      productId: '00000000-0000-4000-8000-000000000501',
      selectedAssemblies: [
        {
          createdAt: '2026-07-01T00:00:00.000Z',
          id: '00000000-0000-4000-8000-000000000601',
          productAssemblyId: '00000000-0000-4000-8000-000000000401',
          quoteId: '00000000-0000-4000-8000-000000000201',
          quotedName: 'Hydraulics',
          quotedPrice: 5000,
          updatedAt: '2026-07-01T00:00:00.000Z',
        },
      ],
      updatedAt: '2026-07-01T00:00:00.000Z',
    };

    const listProjection = projectQuoteListItem(quote);
    const detailProjection = projectQuoteDetail(quote);

    expect(JSON.stringify(listProjection)).not.toContain('lineItems');
    expect(JSON.stringify(listProjection)).not.toContain('selectedAssemblies');
    expect(detailProjection).toMatchObject({
      customerEmail: 'buyer@apex.example',
      lineItems: [{ id: '00000000-0000-4000-8000-000000000301', name: 'Freight', quantity: 1, unitPrice: 1000 }],
      selectedAssemblies: [
        {
          id: '00000000-0000-4000-8000-000000000601',
          productAssemblyId: '00000000-0000-4000-8000-000000000401',
          quotedName: 'Hydraulics',
          quotedPrice: 5000,
        },
      ],
    });
    expect(JSON.stringify(detailProjection)).not.toContain('quoteId');
    expect(JSON.stringify(detailProjection)).not.toContain('updatedAt');
    expect(JSON.stringify(detailProjection)).not.toContain('thumbnailDataUrl');
  });

  test('trims Job list rows and Job detail documents separately', () => {
    const listProjection = projectJobListItem({
      code: 'JOB-00001',
      createdAt: '2026-07-01T00:00:00.000Z',
      customerCompanyName: 'Apex Quarry Services',
      customerId: '00000000-0000-4000-8000-000000000101',
      id: '00000000-0000-4000-8000-000000000201',
      productSerialNumber: 'CL260001',
      quoteCode: 'QUO-00001',
      quoteId: '00000000-0000-4000-8000-000000000301',
      updatedAt: '2026-07-01T00:00:00.000Z',
    });
    const detailProjection = projectJobDetail({
      code: 'JOB-00001',
      documents: [
        {
          byteSize: 123456,
          contentType: 'application/pdf',
          createdAt: '2026-07-01T00:00:00.000Z',
          filename: 'brochure.pdf',
          id: '00000000-0000-4000-8000-000000000401',
          jobId: '00000000-0000-4000-8000-000000000201',
          metadata: { type: 'brochure' },
          ownerType: 'job',
          sourceProductId: '00000000-0000-4000-8000-000000000501',
          sourceProductName: 'Compact Loader',
          uploaderEmail: 'planner@example.com',
          uploaderName: 'Planner User',
          uploaderUserId: 'planner-user-id',
        },
      ],
      id: '00000000-0000-4000-8000-000000000201',
    });

    expect(listProjection).toMatchObject({
      code: 'JOB-00001',
      createdAt: '2026-07-01T00:00:00.000Z',
      productSerialNumber: 'CL260001',
    });
    expect(detailProjection).toMatchObject({
      documents: [
        {
          createdAt: '2026-07-01T00:00:00.000Z',
          filename: 'brochure.pdf',
          id: '00000000-0000-4000-8000-000000000401',
          metadata: { type: 'brochure' },
          sourceProductName: 'Compact Loader',
          uploaderEmail: 'planner@example.com',
          uploaderName: 'Planner User',
        },
      ],
    });
    expect(JSON.stringify(detailProjection)).not.toContain('byteSize');
    expect(JSON.stringify(detailProjection)).not.toContain('ownerType');
    expect(JSON.stringify(detailProjection)).not.toContain('uploaderUserId');
    expect(JSON.stringify(detailProjection)).not.toContain('jobId');
  });

  test('narrows User and Quote salesperson result shapes independently', () => {
    const user = {
      departments: ['fabrication'],
      email: 'planner@example.com',
      emailVerified: false,
      id: 'planner-user-id',
      name: 'Planner User',
      phoneNumber: '+27123456789',
      role: 'admin',
      thumbnailDataUrl: 'data:image/webp;base64,aaaa',
    };

    expect(projectUserList({ sortBy: 'name', users: [user] })).toEqual({
      users: [
        {
          departments: ['fabrication'],
          email: 'planner@example.com',
          id: 'planner-user-id',
          name: 'Planner User',
          phoneNumber: '+27123456789',
          role: 'admin',
        },
      ],
    });
    expect(projectQuoteSalespeople({ users: [user] })).toEqual({
      users: [{ email: 'planner@example.com', id: 'planner-user-id', name: 'Planner User', role: 'admin' }],
    });
  });

  test('converts bulky Audit Event changes to concise previews', () => {
    const projected = projectAuditEventList({
      items: [
        {
          action: 'updated',
          changes: {
            config: {
              from: { deeply: { nested: { data: true } }, list: [1, 2, 3] },
              to: { deeply: { nested: { data: false } }, list: [1, 2, 3, 4] },
            },
            name: {
              from: 'Short',
              to: 'A very long value '.repeat(12),
            },
          },
          entityId: 'entity-id',
          entityType: 'product',
          id: 'event-id',
          occurredAt: '2026-07-01T00:00:00.000Z',
          summary: 'Updated product',
        },
      ],
      sortBy: 'occurredAt',
      sortDirection: 'desc',
      total: 1,
    });

    expect(projected).toEqual({
      items: [
        {
          action: 'updated',
          changes: {
            config: {
              from: '[object:deeply,list]',
              to: '[object:deeply,list]',
            },
            name: {
              from: 'Short',
              to: expect.stringMatching(/\.\.\.$/),
            },
          },
          entityId: 'entity-id',
          entityType: 'product',
          id: 'event-id',
          occurredAt: '2026-07-01T00:00:00.000Z',
          summary: 'Updated product',
        },
      ],
      total: 1,
    });
  });

  test('truncates oversized arrays with an explicit marker', () => {
    const result = prepareAiToolResultForModel(
      {
        items: Array.from({ length: 20 }, (_, index) => ({
          description: `item ${index} ${'x'.repeat(100)}`,
          id: index,
        })),
      },
      { maxSerializedBytes: 700 },
    );

    expect(result.size.truncated).toBe(true);
    expect(result.size.serializedBytes).toBeLessThanOrEqual(700);
    expect(JSON.stringify(result.result)).toContain('__aiToolResultTruncatedItems');
  });

  test('preserves fixed schedule departments when nested slot arrays can be truncated', () => {
    const departments = ['Cutting', 'Welding', 'Paint', 'Assembly', 'Dispatch'];
    const result = prepareAiToolResultForModel(
      {
        schedule: departments.map((department) => ({
          bays: [
            {
              id: `${department.toLowerCase()}-bay`,
              slots: Array.from({ length: 12 }, (_, index) => ({
                id: `${department.toLowerCase()}-slot-${index}`,
                jobCode: `JOB-${index.toString().padStart(5, '0')}`,
                note: `slot progress detail ${index} ${'x'.repeat(80)}`,
              })),
            },
          ],
          department,
        })),
      },
      { maxSerializedBytes: 1_900 },
    );

    expect(result.size.truncated).toBe(true);
    expect(result.size.serializedBytes).toBeLessThanOrEqual(1_900);

    const projected = result.result as {
      schedule: Array<{ bays: Array<{ slots: unknown[] }>; department?: string }>;
    };
    expect(projected.schedule).toHaveLength(departments.length);
    expect(projected.schedule.map((department) => department.department)).toEqual(departments);
    const hasNestedSlotTruncation = projected.schedule.some((department) =>
      JSON.stringify(department.bays[0]?.slots).includes('__aiToolResultTruncatedItems'),
    );
    expect(hasNestedSlotTruncation).toBe(true);
  });

  test('truncates oversized list items instead of tiny per-item links arrays', () => {
    const result = prepareAiToolResultForModel({
      items: Array.from({ length: 120 }, (_, index) => ({
        id: `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
        links: [
          {
            entity: 'Product',
            id: `00000000-0000-4000-8000-${index.toString().padStart(12, '0')}`,
            label: `Product ${index}`,
          },
        ],
        name: `Product ${index} ${'x'.repeat(150)}`,
      })),
      total: 120,
    });

    expect(result.size.truncated).toBe(true);
    expect(result.size.serializedBytes).toBeLessThanOrEqual(24 * 1024);
    expect(result.result).not.toHaveProperty('__aiToolResultTruncated');

    const projected = result.result as { items: unknown[] };
    expect(projected.items).toHaveLength(61);
    expect(JSON.stringify(projected.items.at(-1))).toContain('__aiToolResultTruncatedItems');
    expect(JSON.stringify(projected.items[0])).toContain('"links"');
  });

  test('projectSupplier drops thumbnails and adds no links', () => {
    expect(
      projectSupplier({
        id: '00000000-0000-4000-8000-000000000001',
        companyName: 'Bolt Traders',
        email: 'bolt@example.com',
        address: null,
        contactPerson: 'Sam Supplier',
        phone: '+27110000000',
        notes: null,
        thumbnailDataUrl: 'data:image/webp;base64,aaaa',
        createdAt: '2026-06-17T08:00:00.000Z',
        updatedAt: '2026-06-17T08:00:00.000Z',
      }),
    ).toEqual({
      id: '00000000-0000-4000-8000-000000000001',
      companyName: 'Bolt Traders',
      email: 'bolt@example.com',
      address: null,
      contactPerson: 'Sam Supplier',
      phone: '+27110000000',
      notes: null,
    });
  });

  test('projectDocumentList trims each document to id, filename, type, and created date', () => {
    expect(
      projectDocumentList([
        {
          id: '00000000-0000-4000-8000-000000000001',
          ownerType: 'quote',
          quoteId: '00000000-0000-4000-8000-000000000009',
          filename: 'quote.pdf',
          contentType: 'application/pdf',
          byteSize: 2048,
          metadata: { revision: 2 },
          uploaderUserId: 'test-user-id',
          uploaderName: 'Test User',
          uploaderEmail: 'test@example.com',
          createdAt: '2026-06-17T08:00:00.000Z',
        },
      ]),
    ).toEqual([
      {
        id: '00000000-0000-4000-8000-000000000001',
        filename: 'quote.pdf',
        contentType: 'application/pdf',
        metadata: { revision: 2 },
        createdAt: '2026-06-17T08:00:00.000Z',
      },
    ]);
  });

  test('projectStaleSentQuotes links each Quote by Quote Code', () => {
    const projected = projectStaleSentQuotes({
      items: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          code: 'QUO-00001',
          customerCompanyName: 'Apex Quarry Services',
          currencyCode: 'ZAR',
          sentDaysAgo: 30,
          statusChangedAt: '2026-06-17T08:00:00.000Z',
          totalValue: 1000,
        },
      ],
    }) as { items: Array<{ links: unknown[] }> };

    expect(projected.items[0]?.links).toEqual([
      { entity: 'Quote', href: '/quotes/00000000-0000-4000-8000-000000000001/edit', label: 'QUO-00001' },
    ]);
  });

  test('projectBaySchedule flattens the disabled flag and keeps Job display facts', () => {
    const projected = projectBaySchedule({
      items: [
        {
          id: '00000000-0000-4000-8000-000000000010',
          name: 'Bay 1',
          department: 'paint',
          disabledAt: null,
          nextAvailableDate: '2026-07-13',
          scheduleOrigin: '2026-07-09',
          createdAt: '2026-06-01T08:00:00.000Z',
          updatedAt: '2026-06-01T08:00:00.000Z',
          calendarExceptions: [],
          slots: [],
        },
      ],
      jobs: [],
      offDays: [],
      today: '2026-07-09',
    }) as { items: Array<{ disabled: boolean }>; today: string };

    expect(projected.items[0]?.disabled).toBe(false);
    expect(projected.today).toBe('2026-07-09');
  });
});
