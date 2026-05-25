import type { Product, Station } from '@pkg/schema';
import { describe, expect, test } from 'vitest';

import {
  applySelectedStationsToStages,
  buildCreateJobInput,
  createDefaultStages,
  getInfeasibleMessage,
  mergeDefaultStages,
  type StageDraft,
  toDateInputValue,
} from './create-job-dialog-helpers.js';

describe('create job dialog helpers', () => {
  test('formats local calendar dates for date inputs', () => {
    expect(toDateInputValue(new Date(2026, 4, 21))).toBe('2026-05-21');
  });

  test('computes Product defaults from the selected anchor', () => {
    const stages = createDefaultStages({
      createDraftId: createDeterministicDraftId(),
      dueDate: '2026-05-10',
      product: createProduct(),
    });

    expect(
      stages.map((stage) => ({ plannedEnd: stage.plannedEnd, plannedStart: stage.plannedStart, stage: stage.stage })),
    ).toEqual([
      { plannedEnd: '2026-05-02', plannedStart: '2026-05-01', stage: 'procurement' },
      { plannedEnd: '2026-05-04', plannedStart: '2026-05-02', stage: 'supply' },
      { plannedEnd: '2026-05-07', plannedStart: '2026-05-04', stage: 'fabrication' },
      { plannedEnd: '2026-05-08', plannedStart: '2026-05-07', stage: 'paint' },
      { plannedEnd: '2026-05-10', plannedStart: '2026-05-08', stage: 'assembly' },
    ]);
    expect(stages.find((stage) => stage.stage === 'fabrication')?.stationBookings).toMatchObject([
      {
        plannedEnd: '2026-05-07',
        plannedStart: '2026-05-04',
        id: 'draft-1',
        stationId: '00000000-0000-4000-8000-000000000003',
      },
    ]);
  });

  test('recomputes default dates and preserves manually added stations when defaults recompute', () => {
    const currentStage = createStageDraft({
      plannedStart: '2026-05-04',
      stationBookings: [
        {
          plannedEnd: '2026-05-07',
          plannedStart: '2026-05-05',
          id: 'existing-default-station',
          stationId: '00000000-0000-4000-8000-000000000003',
        },
        {
          plannedEnd: '2026-05-07',
          plannedStart: '2026-05-06',
          id: 'added-station',
          stationId: '00000000-0000-4000-8000-000000000099',
        },
      ],
    });
    const nextDefaultStage = createStageDraft({
      plannedEnd: '2026-06-07',
      plannedStart: '2026-06-04',
      stationBookings: [
        {
          plannedEnd: '2026-06-07',
          plannedStart: '2026-06-04',
          id: 'new-default-station',
          stationId: '00000000-0000-4000-8000-000000000003',
        },
      ],
    });

    const [merged] = mergeDefaultStages([currentStage], [nextDefaultStage]);

    expect(merged).toMatchObject({
      plannedEnd: '2026-06-07',
      plannedStart: '2026-06-04',
      stationBookings: [
        {
          plannedEnd: '2026-06-07',
          plannedStart: '2026-06-04',
          id: 'existing-default-station',
          stationId: '00000000-0000-4000-8000-000000000003',
        },
        {
          plannedEnd: '2026-05-07',
          plannedStart: '2026-05-06',
          id: 'added-station',
          stationId: '00000000-0000-4000-8000-000000000099',
        },
      ],
    });
  });

  test('maps one grouped station selection into stage bookings while preserving existing bookings', () => {
    const stages = [
      createStageDraft({
        plannedEnd: '2026-05-02',
        plannedStart: '2026-05-01',
        stage: 'procurement',
        stationBookings: [
          {
            plannedEnd: '2026-05-03',
            plannedStart: '2026-05-02',
            id: 'existing-procurement',
            stationId: '00000000-0000-4000-8000-000000000001',
          },
        ],
      }),
      createStageDraft({ plannedEnd: '2026-05-07', plannedStart: '2026-05-04', stage: 'fabrication' }),
    ];

    expect(
      applySelectedStationsToStages({
        createDraftId: createDeterministicDraftId(),
        selectedStationIds: ['00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003'],
        stages,
        stations: [
          createStation({ department: 'procurement', id: '00000000-0000-4000-8000-000000000001' }),
          createStation({ department: 'fabrication', id: '00000000-0000-4000-8000-000000000003' }),
          createStation({ department: 'paint', id: '00000000-0000-4000-8000-000000000005' }),
        ],
      }),
    ).toMatchObject([
      {
        stage: 'procurement',
        stationBookings: [
          {
            plannedEnd: '2026-05-03',
            plannedStart: '2026-05-02',
            id: 'existing-procurement',
            stationId: '00000000-0000-4000-8000-000000000001',
          },
        ],
      },
      {
        stage: 'fabrication',
        stationBookings: [
          {
            plannedEnd: '2026-05-07',
            plannedStart: '2026-05-04',
            id: 'draft-1',
            stationId: '00000000-0000-4000-8000-000000000003',
          },
        ],
      },
    ]);
  });

  test('builds create input without dead Job or Stage windows', () => {
    expect(
      buildCreateJobInput({
        dueDate: '2026-05-10',
        productId: '00000000-0000-4000-8000-000000000010',
        quoteId: null,
        stages: [
          createStageDraft({ plannedEnd: '2026-05-02', plannedStart: '2026-05-01', stage: 'procurement' }),
          createStageDraft({ stage: 'supply' }),
          createStageDraft({ stage: 'fabrication' }),
          createStageDraft({ stage: 'paint' }),
          createStageDraft({ plannedEnd: '2026-05-10', plannedStart: '2026-05-08', stage: 'assembly' }),
        ],
      }),
    ).toMatchObject({
      dueDate: '2026-05-10',
      productId: '00000000-0000-4000-8000-000000000010',
      stages: expect.arrayContaining([
        expect.not.objectContaining({
          plannedEnd: expect.anything(),
          plannedStart: expect.anything(),
        }),
      ]),
    });
  });

  test('passes a cleared create Job Due Date as null', () => {
    expect(
      buildCreateJobInput({
        dueDate: '',
        productId: '00000000-0000-4000-8000-000000000010',
        quoteId: null,
        stages: [],
      }).dueDate,
    ).toBeNull();
  });

  test('reports inverted stage windows as warnings', () => {
    expect(getInfeasibleMessage([createStageDraft({ plannedEnd: '2026-05-01', plannedStart: '2026-05-02' })])).toBe(
      'Fabrication starts after it ends. You can still save, but the dates need attention.',
    );
  });
});

function createProduct(): Product {
  return {
    basePrice: 1000,
    createdAt: '2026-05-01T00:00:00.000Z',
    currencyCode: 'ZAR',
    departmentConfigs: [
      { defaultStationIds: [], department: 'procurement', durationDays: 1 },
      { defaultStationIds: [], department: 'supply', durationDays: 2 },
      {
        defaultStationIds: ['00000000-0000-4000-8000-000000000003'],
        department: 'fabrication',
        durationDays: 3,
      },
      { defaultStationIds: [], department: 'paint', durationDays: 1 },
      { defaultStationIds: [], department: 'assembly', durationDays: 2 },
    ],
    description: null,
    id: '00000000-0000-4000-8000-000000000010',
    modelCode: 'MODEL-1',
    name: 'Product',
    options: [],
    updatedAt: '2026-05-01T00:00:00.000Z',
  };
}

function createStation(overrides: Partial<Station> = {}): Station {
  return {
    createdAt: '2026-05-01T00:00:00.000Z',
    department: 'fabrication',
    displayOrder: 1,
    id: '00000000-0000-4000-8000-000000000003',
    isActive: true,
    name: 'Station',
    updatedAt: '2026-05-01T00:00:00.000Z',
    ...overrides,
  };
}

function createStageDraft(overrides: Partial<StageDraft> = {}): StageDraft {
  return {
    plannedEnd: '2026-05-07',
    plannedStart: '2026-05-04',
    stage: 'fabrication',
    stationBookings: [],
    ...overrides,
  };
}

function createDeterministicDraftId(): () => string {
  let nextId = 1;

  return () => `draft-${nextId++}`;
}
