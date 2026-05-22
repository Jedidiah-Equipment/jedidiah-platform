import type { JobStageName } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { mapJobSummary } from './job-read-service.js';

describe('mapJobSummary', () => {
  it('adds derived schedule windows from station bookings', () => {
    const summary = mapJobSummary({
      ...jobRow(),
      stages: [
        stageRow('procurement', 1, {
          stations: [
            stationBookingRow({
              actualEnd: '2026-05-04T12:00:00.000Z',
              actualStart: '2026-05-03T08:00:00.000Z',
              plannedEnd: '2026-05-05',
              plannedStart: '2026-05-02',
              id: '00000000-0000-4000-8000-000000000201',
            }),
            stationBookingRow({
              actualEnd: null,
              actualStart: '2026-05-02T09:00:00.000Z',
              plannedEnd: null,
              plannedStart: '2026-05-01',
              id: '00000000-0000-4000-8000-000000000202',
            }),
          ],
        }),
        stageRow('supply', 2),
        stageRow('fabrication', 3, {
          stations: [
            stationBookingRow({
              actualEnd: '2026-05-05T12:00:00.000Z',
              actualStart: '2026-05-01T07:00:00.000Z',
              plannedEnd: '2026-05-06',
              plannedStart: '2026-04-30',
              id: '00000000-0000-4000-8000-000000000203',
              stage: 'fabrication',
            }),
          ],
        }),
        stageRow('paint', 4),
        stageRow('assembly', 5),
      ],
    });

    expect(summary.lifecycleStatus).toBe('active');
    expect(summary.actualWindow).toEqual({
      end: null,
      start: '2026-05-01T07:00:00.000Z',
    });
    expect(summary.plannedWindow).toEqual({
      end: null,
      start: '2026-04-30T00:00:00.000Z',
    });

    const procurement = summary.stages.find((stage) => stage.stage === 'procurement');
    expect(procurement).toMatchObject({
      actualWindow: {
        end: null,
        start: '2026-05-02T09:00:00.000Z',
      },
      plannedWindow: {
        end: null,
        start: '2026-05-01T00:00:00.000Z',
      },
      state: 'in-progress',
    });
  });
});

function jobRow() {
  const now = new Date('2026-05-01T00:00:00.000Z');

  return {
    code: 1,
    createdAt: now,
    dueDate: null,
    id: '00000000-0000-4000-8000-000000000001',
    isCancelled: false,
    isPaused: false,
    product: {
      modelCode: 'MODEL-001',
      name: 'Test Product',
    },
    productId: '00000000-0000-4000-8000-000000000002',
    quote: null,
    quoteId: null,
    updatedAt: now,
  };
}

function stageRow(
  stage: JobStageName,
  sequence: number,
  overrides: Partial<ReturnType<typeof baseStageRow>> & { stations?: ReturnType<typeof stationBookingRow>[] } = {},
) {
  return {
    ...baseStageRow(stage, sequence),
    ...overrides,
    stations: overrides.stations ?? [],
  };
}

function baseStageRow(stage: JobStageName, sequence: number) {
  return {
    id: stageRowIds[stage],
    jobId: '00000000-0000-4000-8000-000000000001',
    sequence,
    stage,
  };
}

function stationBookingRow(input: {
  actualEnd: string | null;
  actualStart: string | null;
  plannedEnd: string | null;
  plannedStart: string | null;
  id: string;
  stage?: JobStageName;
}) {
  const now = new Date('2026-05-01T00:00:00.000Z');
  const stage = input.stage ?? 'procurement';

  return {
    actualEnd: input.actualEnd ? new Date(input.actualEnd) : null,
    actualStart: input.actualStart ? new Date(input.actualStart) : null,
    createdAt: now,
    plannedEnd: input.plannedEnd,
    plannedStart: input.plannedStart,
    id: input.id,
    jobStageId: stageRowIds[stage],
    station: {
      createdAt: now,
      department: stage,
      displayOrder: 1,
      id: '00000000-0000-4000-8000-000000000301',
      isActive: true,
      name: 'Procurement Desk',
      updatedAt: now,
    },
    stationId: '00000000-0000-4000-8000-000000000301',
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
