import * as core from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect } from 'vitest';
import { z } from 'zod';
import {
  createActorUser,
  createAiContext,
  createProductWithRangeFixture,
  createQuoteFixture,
  createTester,
} from '../test-support.js';
import { getQuoteDefinition, getQuoteTool } from './get-quote.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db, 'sales');
  const product = await createProductWithRangeFixture(db, 'Quote Get Product');

  return { db, product };
});

describe('getQuoteTool', () => {
  test('returns the same quote detail shape as quotes.get', async ({ context }) => {
    const created = await createQuoteFixture(context.db, context.product.id);
    const access = createUserAccessSummary({
      role: 'sales',
      userId: 'test-user-id',
    });

    const [toolResult, trpcResult] = await Promise.all([
      getQuoteTool.handler({ id: created.id }, createAiContext(context.db, access)),
      core.getQuote({ db: context.db, id: created.id }),
    ]);

    expect(toolResult).toEqual(trpcResult);
    expect(toolResult).toMatchObject({
      depositPercent: 30,
      plannedDeliveryDate: '2026-07-15',
      preferredDeliveryDate: '2026-07-10',
    });
  });

  test('surfaces the core not-found message for missing quotes', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'sales',
      userId: 'test-user-id',
    });

    await expect(
      getQuoteTool.handler(
        {
          id: '00000000-0000-4000-8000-000000000001',
        },
        createAiContext(context.db, access),
      ),
    ).rejects.toThrow('Quote not found: 00000000-0000-4000-8000-000000000001');
  });

  test('rejects invalid quote get args', async ({ context }) => {
    const access = createUserAccessSummary({
      role: 'sales',
      userId: 'test-user-id',
    });

    await expect(getQuoteTool.handler({ id: 'bad-id' }, createAiContext(context.db, access))).rejects.toBeInstanceOf(
      z.ZodError,
    );
  });

  test('projects Quote metadata to detail results without legacy sentAt', () => {
    const quote = {
      customerCompanyName: 'Apex Quarry Services',
      customerId: '00000000-0000-4000-8000-000000000005',
      id: '00000000-0000-4000-8000-000000000003',
      code: 'QUO-00003',
      documentNotes: '30% deposit, balance on delivery',
      plannedDeliveryDate: '2026-07-15',
      product: {
        buildTimeDays: 14,
        currencyCode: 'ZAR',
        modelCode: 'JED-SS-003',
        name: 'Vertex Skid Steer 003',
      },
      productId: '00000000-0000-4000-8000-000000000006',
      preferredDeliveryDate: '2026-07-10',
      quotedBasePrice: 100000,
      quotedCurrencyCode: 'ZAR',
      salesPersonId: 'test-user-id',
      sentAt: '2026-07-01T00:00:00.000Z',
    };

    const project = getQuoteDefinition.projectResult as (value: unknown) => unknown;

    expect(project(quote)).toEqual({
      customerCompanyName: 'Apex Quarry Services',
      customerId: '00000000-0000-4000-8000-000000000005',
      id: '00000000-0000-4000-8000-000000000003',
      code: 'QUO-00003',
      documentNotes: '30% deposit, balance on delivery',
      plannedDeliveryDate: '2026-07-15',
      product: {
        buildTimeDays: 14,
        currencyCode: 'ZAR',
        modelCode: 'JED-SS-003',
        name: 'Vertex Skid Steer 003',
      },
      productId: '00000000-0000-4000-8000-000000000006',
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

  test('projects Custom Quote null product fields and skips Product link', () => {
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
      product: null,
      productId: null,
      preferredDeliveryDate: '2026-07-10',
      quotedBasePrice: 2500,
      quotedCurrencyCode: 'ZAR',
      salesPersonId: 'test-user-id',
      selectedAssemblies: [],
      sentAt: '2026-07-01T00:00:00.000Z',
      workTitle: 'Hydraulic repair',
    };

    const project = getQuoteDefinition.projectResult as (value: unknown) => unknown;

    expect(project(quote)).toEqual({
      customerCompanyName: 'Apex Quarry Services',
      customerId: '00000000-0000-4000-8000-000000000005',
      id: '00000000-0000-4000-8000-000000000003',
      code: 'QUO-00003',
      documentNotes: '30% deposit, balance on delivery',
      job: null,
      kind: 'custom',
      lineItems: [{ name: 'Travel', quantity: 2, unitPrice: 150 }],
      plannedDeliveryDate: '2026-07-15',
      product: null,
      productId: null,
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
});
