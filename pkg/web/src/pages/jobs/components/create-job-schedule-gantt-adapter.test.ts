import type { Station } from '@pkg/schema';
import { describe, expect, test } from 'vitest';

import type { ScheduleGanttStationBooking } from '@/pages/job-detail/components/schedule-gantt-helpers.js';

import type { StageDraft } from './create-job-dialog-helpers.js';
import {
  applyCreateScheduleGanttPlannedRangeEdit,
  buildCreateScheduleGanttRows,
} from './create-job-schedule-gantt-adapter.js';

describe('create job schedule gantt adapter', () => {
  test('builds draft Job and Stage rows with nested station bookings', () => {
    expect(buildCreateScheduleGanttRows({ stages: createStages(), stations: [createStation()] })).toEqual([
      expect.objectContaining({
        actualEnd: null,
        actualStart: null,
        plannedEnd: '2026-05-03',
        plannedStart: '2026-05-01',
        id: 'create-job',
        level: 'stage',
        stationBookings: [
          expect.objectContaining({
            barKind: 'job',
            id: 'create-job-summary',
            level: 'station',
            readOnly: true,
            title: 'Draft Job',
          }),
        ],
      }),
      expect.objectContaining({
        actualEnd: null,
        actualStart: null,
        plannedEnd: '2026-05-03',
        plannedStart: '2026-05-01',
        id: 'create-stage-fabrication',
        level: 'stage',
        stationBookings: [
          expect.objectContaining({
            actualEnd: null,
            actualStart: null,
            plannedEnd: '2026-05-03',
            plannedStart: '2026-05-01',
            id: 'create-station-booking-1',
            level: 'station',
            parentId: 'create-stage-fabrication',
            stage: 'fabrication',
            title: 'Weld Bay',
          }),
        ],
        title: 'Fabrication',
      }),
    ]);
  });

  test('does not emit standalone draft station rows', () => {
    expect(
      buildCreateScheduleGanttRows({ stages: createStages(), stations: [createStation()] }).map((row) => row.level),
    ).toEqual(['stage', 'stage']);
  });

  test('dragging a draft station booking pins only changed booking edges', () => {
    const edit = applyCreateScheduleGanttPlannedRangeEdit({
      nextRange: { plannedEnd: '2026-05-04', plannedStart: '2026-05-01' },
      row: createStationBookingRow({ entityId: 'booking-1' }),
      stages: createStages(),
    });

    expect(edit).toMatchObject([
      {
        plannedEnd: '2026-05-03',
        plannedStart: '2026-05-01',
        stationBookings: [
          {
            plannedEnd: '2026-05-04',
            plannedStart: '2026-05-01',
          },
        ],
      },
    ]);
  });
});

function createStages(): StageDraft[] {
  return [
    {
      plannedEnd: '2026-05-03',
      plannedStart: '2026-05-01',
      stage: 'fabrication',
      stationBookings: [
        {
          plannedEnd: '2026-05-03',
          plannedStart: '2026-05-01',
          id: 'booking-1',
          stationId: '00000000-0000-4000-8000-000000000003',
        },
      ],
    },
  ];
}

function createStation(): Station {
  return {
    createdAt: '2026-05-01T00:00:00.000Z',
    department: 'fabrication',
    displayOrder: 1,
    id: '00000000-0000-4000-8000-000000000003',
    isActive: true,
    name: 'Weld Bay',
    updatedAt: '2026-05-01T00:00:00.000Z',
  };
}

function createStationBookingRow(overrides: Partial<ScheduleGanttStationBooking> = {}): ScheduleGanttStationBooking {
  return {
    actualEnd: null,
    actualStart: null,
    plannedEnd: '2026-05-03',
    plannedStart: '2026-05-01',
    entityId: 'booking-1',
    id: 'create-station-booking-1',
    level: 'station',
    parentId: 'create-stage-fabrication',
    stage: 'fabrication',
    stationId: '00000000-0000-4000-8000-000000000003',
    statusLabel: 'Draft',
    title: 'Weld Bay',
    ...overrides,
  };
}
