import { jobBays } from '@pkg/db';
import { createUserAccessSummary } from '@pkg/domain';
import type { JobStageName } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { createTester } from '../test/create-tester.js';
import { listBays, mapJobSummary } from './job-read-service.js';

const test = createTester(async ({ db }) => {
  await db
    .insert(jobBays)
    .values([
      bayRow('00000000-0000-4000-8000-000000000b03', 'Fabrication Bay 3'),
      bayRow('00000000-0000-4000-8000-000000000b01', 'Fabrication Bay 1'),
      bayRow('00000000-0000-4000-8000-000000000b02', 'Fabrication Bay 2'),
    ]);

  return {};
});

describe('mapJobSummary', () => {
  it('maps jobs with stage summaries', () => {
    const summary = mapJobSummary({
      ...jobRow(),
      stages: [
        stageRow('procurement', 1),
        stageRow('supply', 2),
        stageRow('fabrication', 3),
        stageRow('paint', 4),
        stageRow('assembly', 5),
      ],
    });

    expect(summary.stages).toHaveLength(5);
    expect(summary.stages.map((stage) => stage.stage)).toEqual([
      'procurement',
      'supply',
      'fabrication',
      'paint',
      'assembly',
    ]);
    expect(summary.productSerialNumber).toBe('MODEL-001260001');
  });
});

describe('listBays', () => {
  test('returns bays in deterministic order for admins', async ({ context }) => {
    const result = await listBays({
      db: context.db,
      access: createUserAccessSummary({ role: 'admin', userId: 'admin-user' }),
    });

    expect(result.items.map((bay) => bay.name)).toEqual([
      'Fabrication Bay 1',
      'Fabrication Bay 2',
      'Fabrication Bay 3',
    ]);
  });

  test('returns all bays for job supervisors', async ({ context }) => {
    const result = await listBays({
      db: context.db,
      access: createUserAccessSummary({ role: 'job-supervisor', userId: 'supervisor-user' }),
    });

    expect(result.items).toHaveLength(3);
  });

  test('returns matching department bays for fabrication department managers', async ({ context }) => {
    const result = await listBays({
      db: context.db,
      access: createUserAccessSummary({
        departments: ['fabrication'],
        role: 'job-department-manager',
        userId: 'fabrication-manager',
      }),
    });

    expect(result.items.map((bay) => bay.department)).toEqual(['fabrication', 'fabrication', 'fabrication']);
  });

  test('returns no bays for non-fabrication department managers', async ({ context }) => {
    const result = await listBays({
      db: context.db,
      access: createUserAccessSummary({
        departments: ['paint'],
        role: 'job-department-manager',
        userId: 'paint-manager',
      }),
    });

    expect(result.items).toEqual([]);
  });
});

function jobRow() {
  const now = new Date('2026-05-01T00:00:00.000Z');

  return {
    code: 1,
    createdAt: now,
    id: '00000000-0000-4000-8000-000000000001',
    product: {
      modelCode: 'MODEL-001',
      name: 'Test Product',
    },
    productId: '00000000-0000-4000-8000-000000000002',
    productSerialNumber: 'MODEL-001260001',
    productSerialPrefix: 'MODEL-001',
    productSerialSequence: 1,
    productSerialYear: 26,
    quote: {
      code: 1,
      customer: {
        companyName: 'Test Customer',
      },
    },
    quoteId: '00000000-0000-4000-8000-000000000003',
    updatedAt: now,
    vinNumber: null,
  };
}

function stageRow(stage: JobStageName, sequence: number) {
  return {
    id: stageRowIds[stage],
    jobId: '00000000-0000-4000-8000-000000000001',
    sequence,
    stage,
  };
}

function bayRow(id: string, name: string) {
  const now = new Date('2026-06-05T00:00:00.000Z');

  return {
    createdAt: now,
    department: 'fabrication' as const,
    id,
    name,
    scheduleOrigin: now,
    updatedAt: now,
  };
}

const stageRowIds = {
  procurement: '00000000-0000-4000-8000-000000000101',
  supply: '00000000-0000-4000-8000-000000000102',
  fabrication: '00000000-0000-4000-8000-000000000103',
  paint: '00000000-0000-4000-8000-000000000104',
  assembly: '00000000-0000-4000-8000-000000000105',
} as const satisfies Record<JobStageName, string>;
