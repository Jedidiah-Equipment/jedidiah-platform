import type { Station } from '@pkg/schema';
import { describe, expect, test } from 'vitest';

import type { ScheduleGanttRow } from '@/pages/job-detail/components/schedule-gantt-helpers.js';

import type { StageDraft } from './create-job-dialog-helpers.js';
import {
  applyCreateScheduleGanttDueRangeEdit,
  buildCreateScheduleGanttRows,
} from './create-job-schedule-gantt-adapter.js';

describe('create job schedule gantt adapter', () => {
  test('builds due-only rows for draft stages and station bookings', () => {
    expect(buildCreateScheduleGanttRows({ stages: createStages(), stations: [createStation()] })).toEqual([
      expect.objectContaining({
        actualEnd: null,
        actualStart: null,
        dueEnd: '2026-05-03',
        dueStart: '2026-05-01',
        id: 'create-job',
        level: 'job',
      }),
      expect.objectContaining({
        actualEnd: null,
        actualStart: null,
        dueEnd: '2026-05-03',
        dueStart: '2026-05-01',
        id: 'create-stage-fabrication',
        level: 'stage',
        title: 'Fabrication',
      }),
      expect.objectContaining({
        actualEnd: null,
        actualStart: null,
        dueEnd: '2026-05-03',
        dueStart: '2026-05-01',
        id: 'create-station-booking-1',
        level: 'station',
        parentId: 'create-stage-fabrication',
        title: 'Weld Bay',
      }),
    ]);
  });

  test('ignores edits for derived draft Job and Stage rows', () => {
    const stages = createStages();

    const edit = applyCreateScheduleGanttDueRangeEdit({
      anchorKind: 'start',
      nextRange: { dueEnd: '2026-05-12', dueStart: '2026-05-01' },
      row: createRow({ dueEnd: '2026-05-10', dueStart: '2026-05-01', level: 'job' }),
      stages,
    });

    expect(edit).toEqual({ kind: 'stages', stages });
  });

  test('dragging a draft station booking pins only changed booking edges', () => {
    const edit = applyCreateScheduleGanttDueRangeEdit({
      anchorKind: 'end',
      nextRange: { dueEnd: '2026-05-04', dueStart: '2026-05-01' },
      row: createRow({ entityId: 'booking-1', level: 'station' }),
      stages: createStages(),
    });

    expect(edit).toMatchObject({
      kind: 'stages',
      stages: [
        {
          dueEnd: '2026-05-03',
          dueStart: '2026-05-01',
          stationBookings: [
            {
              dueEnd: '2026-05-04',
              dueEndSetManually: true,
              dueStart: '2026-05-01',
              dueStartSetManually: false,
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
      dueEnd: '2026-05-03',
      dueEndSetManually: false,
      dueStart: '2026-05-01',
      dueStartSetManually: false,
      stage: 'fabrication',
      stationBookings: [
        {
          dueEnd: '2026-05-03',
          dueEndSetManually: false,
          dueStart: '2026-05-01',
          dueStartSetManually: false,
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
    dueEnd: '2026-05-03',
    dueStart: '2026-05-01',
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
