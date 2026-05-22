import type { Product } from '@pkg/schema';
import { describe, expect, test } from 'vitest';

import {
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
      anchorDate: '2026-05-10',
      anchorKind: 'end',
      createDraftId: createDeterministicDraftId(),
      product: createProduct(),
    });

    expect(stages.map((stage) => ({ dueEnd: stage.dueEnd, dueStart: stage.dueStart, stage: stage.stage }))).toEqual([
      { dueEnd: '2026-05-02', dueStart: '2026-05-01', stage: 'procurement' },
      { dueEnd: '2026-05-04', dueStart: '2026-05-02', stage: 'supply' },
      { dueEnd: '2026-05-07', dueStart: '2026-05-04', stage: 'fabrication' },
      { dueEnd: '2026-05-08', dueStart: '2026-05-07', stage: 'paint' },
      { dueEnd: '2026-05-10', dueStart: '2026-05-08', stage: 'assembly' },
    ]);
    expect(stages.find((stage) => stage.stage === 'fabrication')?.stationBookings).toMatchObject([
      {
        dueEnd: '2026-05-07',
        dueStart: '2026-05-04',
        id: 'draft-1',
        stationId: '00000000-0000-4000-8000-000000000003',
      },
    ]);
  });

  test('keeps manually edited dates when defaults recompute', () => {
    const currentStage = createStageDraft({
      dueStart: '2026-05-04',
      dueStartSetManually: true,
      stationBookings: [
        {
          dueEnd: '2026-05-07',
          dueEndSetManually: false,
          dueStart: '2026-05-05',
          dueStartSetManually: true,
          id: 'existing-default-station',
          stationId: '00000000-0000-4000-8000-000000000003',
        },
        {
          dueEnd: '2026-05-07',
          dueEndSetManually: false,
          dueStart: '2026-05-06',
          dueStartSetManually: true,
          id: 'added-station',
          stationId: '00000000-0000-4000-8000-000000000099',
        },
      ],
    });
    const nextDefaultStage = createStageDraft({
      dueEnd: '2026-06-07',
      dueStart: '2026-06-04',
      stationBookings: [
        {
          dueEnd: '2026-06-07',
          dueEndSetManually: false,
          dueStart: '2026-06-04',
          dueStartSetManually: false,
          id: 'new-default-station',
          stationId: '00000000-0000-4000-8000-000000000003',
        },
      ],
    });

    const [merged] = mergeDefaultStages([currentStage], [nextDefaultStage]);

    expect(merged).toMatchObject({
      dueEnd: '2026-06-07',
      dueStart: '2026-05-04',
      dueStartSetManually: true,
      stationBookings: [
        {
          dueEnd: '2026-06-07',
          dueStart: '2026-05-05',
          id: 'existing-default-station',
          stationId: '00000000-0000-4000-8000-000000000003',
        },
        {
          dueEnd: '2026-06-07',
          dueStart: '2026-05-06',
          id: 'added-station',
          stationId: '00000000-0000-4000-8000-000000000099',
        },
      ],
    });
  });

  test('builds create input without dead Job or Stage windows', () => {
    const input = buildCreateJobInput({
      productId: '00000000-0000-4000-8000-000000000010',
      quoteId: null,
      stages: [
        createStageDraft({ dueEnd: '2026-05-02', dueStart: '2026-05-01', stage: 'procurement' }),
        createStageDraft({ stage: 'supply' }),
        createStageDraft({ stage: 'fabrication' }),
        createStageDraft({ stage: 'paint' }),
        createStageDraft({ dueEnd: '2026-05-10', dueStart: '2026-05-08', stage: 'assembly' }),
      ],
    });

    expect(input).toMatchObject({
      productId: '00000000-0000-4000-8000-000000000010',
    });
    for (const stage of input.stages) {
      expect(stage).not.toHaveProperty('dueEnd');
      expect(stage).not.toHaveProperty('dueStart');
    }
  });

  test('reports inverted stage windows as warnings', () => {
    expect(getInfeasibleMessage([createStageDraft({ dueEnd: '2026-05-01', dueStart: '2026-05-02' })])).toBe(
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

function createStageDraft(overrides: Partial<StageDraft> = {}): StageDraft {
  return {
    dueEnd: '2026-05-07',
    dueEndSetManually: false,
    dueStart: '2026-05-04',
    dueStartSetManually: false,
    stage: 'fabrication',
    stationBookings: [],
    ...overrides,
  };
}

function createDeterministicDraftId(): () => string {
  let nextId = 1;

  return () => `draft-${nextId++}`;
}
