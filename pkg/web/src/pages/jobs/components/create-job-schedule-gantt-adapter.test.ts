import type { Station } from '@pkg/schema';
import { describe, expect, test } from 'vitest';

import type { ScheduleGanttRow } from '@/pages/job-detail/components/schedule-gantt-helpers.js';

import type { StageDraft } from './create-job-dialog-helpers.js';
import {
  applyCreateScheduleGanttPlannedRangeEdit,
  buildCreateScheduleGanttRows,
} from './create-job-schedule-gantt-adapter.js';

describe('create job schedule gantt adapter', () => {
  test('builds due-only rows for draft stages and station bookings', () => {
    expect(buildCreateScheduleGanttRows({ stages: createStages(), stations: [createStation()] })).toEqual([
      expect.objectContaining({
        actualEnd: null,
        actualStart: null,
        plannedEnd: '2026-05-03',
        plannedStart: '2026-05-01',
        id: 'create-job',
        level: 'job',
      }),
      expect.objectContaining({
        actualEnd: null,
        actualStart: null,
        plannedEnd: '2026-05-03',
        plannedStart: '2026-05-01',
        id: 'create-stage-fabrication',
        level: 'stage',
        title: 'Fabrication',
      }),
      expect.objectContaining({
        actualEnd: null,
        actualStart: null,
        plannedEnd: '2026-05-03',
        plannedStart: '2026-05-01',
        id: 'create-station-booking-1',
        level: 'station',
        parentId: 'create-stage-fabrication',
        title: 'Weld Bay',
      }),
    ]);
  });

  test('ignores edits for derived draft Job and Stage rows', () => {
    const stages = createStages();

    const edit = applyCreateScheduleGanttPlannedRangeEdit({
      anchorKind: 'start',
      nextRange: { plannedEnd: '2026-05-12', plannedStart: '2026-05-01' },
      row: createRow({ plannedEnd: '2026-05-10', plannedStart: '2026-05-01', level: 'job' }),
      stages,
    });

    expect(edit).toEqual({ kind: 'stages', stages });
  });

  test('dragging a draft station booking pins only changed booking edges', () => {
    const edit = applyCreateScheduleGanttPlannedRangeEdit({
      anchorKind: 'end',
      nextRange: { plannedEnd: '2026-05-04', plannedStart: '2026-05-01' },
      row: createRow({ entityId: 'booking-1', level: 'station' }),
      stages: createStages(),
    });

    expect(edit).toMatchObject({
      kind: 'stages',
      stages: [
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
      ],
    });
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

function createRow(overrides: Partial<ScheduleGanttRow> = {}): ScheduleGanttRow {
  return {
    actualEnd: null,
    actualStart: null,
    plannedEnd: '2026-05-03',
    plannedStart: '2026-05-01',
    entityId: 'create-job',
    id: 'create-job',
    level: 'job',
    parentId: null,
    stationId: null,
    statusLabel: 'Draft',
    title: 'Draft Job',
    ...overrides,
  };
}
