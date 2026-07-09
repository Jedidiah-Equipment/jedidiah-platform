import * as core from '@pkg/core';
import { createUserAccessSummary } from '@pkg/domain';
import { BoardListInput } from '@pkg/schema';
import { describe, expect } from 'vitest';
import { createTester } from '@/test/create-tester.js';
import { createActorUser, createAiContext } from '@/test/tools.js';
import { listBayScheduleDefinition, listBayScheduleTool } from './list-bay-schedule.js';

const test = createTester(async ({ db }) => {
  await createActorUser(db);

  return { db };
});

const adminAccess = createUserAccessSummary({ role: 'admin', userId: 'test-user-id' });

describe('listBayScheduleTool', () => {
  test('is a job:read read tool', () => {
    expect(listBayScheduleTool.requiredPermission).toBe('job:read');
    expect(listBayScheduleDefinition.kind).toBe('read');
  });

  test('mirrors the jobs.listBays board result', async ({ context }) => {
    const input = BoardListInput.parse({});

    const [toolResult, coreResult] = await Promise.all([
      listBayScheduleTool.handler({}, createAiContext(context.db, adminAccess)),
      core.listBays({ db: context.db, input }),
    ]);

    expect(toolResult).toEqual(coreResult);
  });

  test('projects Bays with a disabled flag, trimmed Slots, and Job links', () => {
    const project = listBayScheduleDefinition.projectResult as (value: unknown) => unknown;

    expect(
      project({
        items: [
          {
            id: '00000000-0000-4000-8000-000000000010',
            name: 'Bay 3',
            department: 'fabrication',
            disabledAt: '2026-06-01T08:00:00.000Z',
            nextAvailableDate: '2026-07-13',
            scheduleOrigin: '2026-07-09',
            createdAt: '2026-06-01T08:00:00.000Z',
            updatedAt: '2026-06-01T08:00:00.000Z',
            calendarExceptions: [],
            slots: [
              {
                id: '00000000-0000-4000-8000-000000000020',
                kind: 'work',
                jobId: '00000000-0000-4000-8000-000000000001',
                jobCode: 'JOB-00001',
                startDate: '2026-07-13',
                endDate: '2026-07-20',
                durationDays: 5,
                state: 'scheduled',
                jobUnfinished: true,
                label: null,
              },
            ],
          },
        ],
        jobs: [
          {
            id: '00000000-0000-4000-8000-000000000001',
            code: 'JOB-00001',
            customerCompanyName: 'Apex Quarry Services',
            customerId: '00000000-0000-4000-8000-000000000005',
            productName: 'Excavator',
            quoteCode: 'QUO-00002',
            quoteId: '00000000-0000-4000-8000-000000000002',
            quoteKind: 'product',
            workTitle: null,
          },
        ],
        offDays: [],
        today: '2026-07-09',
      }),
    ).toEqual({
      items: [
        {
          id: '00000000-0000-4000-8000-000000000010',
          name: 'Bay 3',
          department: 'fabrication',
          nextAvailableDate: '2026-07-13',
          disabled: true,
          slots: [
            {
              kind: 'work',
              jobId: '00000000-0000-4000-8000-000000000001',
              jobCode: 'JOB-00001',
              startDate: '2026-07-13',
              endDate: '2026-07-20',
              durationDays: 5,
              state: 'scheduled',
              label: null,
            },
          ],
        },
      ],
      jobs: [
        {
          id: '00000000-0000-4000-8000-000000000001',
          code: 'JOB-00001',
          customerCompanyName: 'Apex Quarry Services',
          customerId: '00000000-0000-4000-8000-000000000005',
          productName: 'Excavator',
          quoteCode: 'QUO-00002',
          quoteId: '00000000-0000-4000-8000-000000000002',
          quoteKind: 'product',
          workTitle: null,
          links: [
            { entity: 'Job', href: '/jobs/00000000-0000-4000-8000-000000000001', label: 'JOB-00001' },
            { entity: 'Quote', href: '/quotes/00000000-0000-4000-8000-000000000002/edit', label: 'QUO-00002' },
            {
              entity: 'Customer',
              href: '/customers/00000000-0000-4000-8000-000000000005/edit',
              label: 'Apex Quarry Services',
            },
          ],
        },
      ],
      today: '2026-07-09',
    });
  });
});
