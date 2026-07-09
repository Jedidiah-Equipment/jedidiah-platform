import * as core from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { createActorUser, createAiContext } from '@/test/tools.js';
import { listStaleSentQuotesDefinition, listStaleSentQuotesTool } from './list-stale-sent-quotes.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);

  return { db };
});

const adminAccess = createUserAccessSummary({ role: 'admin', userId: 'test-user-id' });

describe('listStaleSentQuotesTool', () => {
  test('is a quote:read read tool', () => {
    expect(listStaleSentQuotesTool.requiredPermission).toBe('quote:read');
    expect(listStaleSentQuotesDefinition.kind).toBe('read');
  });

  test('mirrors the quotes.staleSent result', async ({ context }) => {
    const [toolResult, coreResult] = await Promise.all([
      listStaleSentQuotesTool.handler({}, createAiContext(context.db, adminAccess)),
      core.listStaleSentQuotes({ db: context.db }),
    ]);

    expect(toolResult).toEqual(coreResult);
  });

  test('projects stale Quotes with a Quote link', () => {
    const project = listStaleSentQuotesDefinition.projectResult as (value: unknown) => unknown;

    expect(
      project({
        items: [
          {
            id: '00000000-0000-4000-8000-000000000001',
            code: 'QUO-00001',
            customerCompanyName: 'Apex Quarry Services',
            customerThumbnailDataUrl: 'data:image/webp;base64,aaaa',
            currencyCode: 'ZAR',
            sentDaysAgo: 21,
            statusChangedAt: '2026-06-17T08:00:00.000Z',
            totalValue: 20_990.2,
          },
        ],
      }),
    ).toEqual({
      items: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          code: 'QUO-00001',
          customerCompanyName: 'Apex Quarry Services',
          currencyCode: 'ZAR',
          sentDaysAgo: 21,
          statusChangedAt: '2026-06-17T08:00:00.000Z',
          totalValue: 20_990.2,
          links: [{ entity: 'Quote', href: '/quotes/00000000-0000-4000-8000-000000000001/edit', label: 'QUO-00001' }],
        },
      ],
    });
  });
});
