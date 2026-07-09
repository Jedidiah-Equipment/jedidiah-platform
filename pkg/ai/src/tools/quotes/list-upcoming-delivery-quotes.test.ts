import * as core from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { createActorUser, createAiContext } from '@/test/tools.js';
import {
  listUpcomingDeliveryQuotesDefinition,
  listUpcomingDeliveryQuotesTool,
} from './list-upcoming-delivery-quotes.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);

  return { db };
});

const adminAccess = createUserAccessSummary({ role: 'admin', userId: 'test-user-id' });

describe('listUpcomingDeliveryQuotesTool', () => {
  test('is a quote:read read tool', () => {
    expect(listUpcomingDeliveryQuotesTool.requiredPermission).toBe('quote:read');
    expect(listUpcomingDeliveryQuotesDefinition.kind).toBe('read');
  });

  test('mirrors the quotes.upcomingDeliveries result', async ({ context }) => {
    const [toolResult, coreResult] = await Promise.all([
      listUpcomingDeliveryQuotesTool.handler({}, createAiContext(context.db, adminAccess)),
      core.listUpcomingDeliveryQuotes({ db: context.db }),
    ]);

    expect(toolResult).toEqual(coreResult);
  });

  test('projects items with Quote links and keeps the delivery window', () => {
    const project = listUpcomingDeliveryQuotesDefinition.projectResult as (value: unknown) => {
      items: Array<{ links?: unknown[] }>;
      today: string;
      windowEndDate: string;
    };

    const projected = project({
      items: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          code: 'QUO-00001',
          customerId: '00000000-0000-4000-8000-000000000005',
          customerCompanyName: 'Apex Quarry Services',
          kind: 'product',
          productId: '00000000-0000-4000-8000-000000000009',
          plannedDeliveryDate: '2026-07-15',
          workTitle: null,
          lineItems: [],
          selectedAssemblies: [],
        },
      ],
      today: '2026-07-09',
      windowEndDate: '2026-07-31',
    });

    expect(projected.today).toBe('2026-07-09');
    expect(projected.windowEndDate).toBe('2026-07-31');
    expect(projected.items[0]?.links).toContainEqual({
      entity: 'Quote',
      href: '/quotes/00000000-0000-4000-8000-000000000001/edit',
      label: 'QUO-00001',
    });
  });
});
