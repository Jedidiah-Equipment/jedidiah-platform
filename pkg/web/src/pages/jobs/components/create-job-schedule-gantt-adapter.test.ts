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

  test('moves the selected anchor when the draft job row is dragged', () => {
    const edit = applyCreateScheduleGanttDueRangeEdit({
      anchorKind: 'end',
      nextRange: { dueEnd: '2026-05-12', dueStart: '2026-05-03' },
      row: createRow({ dueEnd: '2026-05-10', dueStart: '2026-05-01', level: 'job' }),
      stages: createStages(),
    });

    expect(edit).toEqual({ anchorDate: '2026-05-12', anchorKind: 'end', kind: 'anchor' });
  });

  test('dragging a draft stage updates non-manual station bookings with the stage range', () => {
    const edit = applyCreateScheduleGanttDueRangeEdit({
      anchorKind: 'end',
      nextRange: { dueEnd: '2026-05-05', dueStart: '2026-05-02' },
      row: createRow({ entityId: 'fabrication', level: 'stage' }),
      stages: createStages(),
    });

    expect(edit).toMatchObject({
      kind: 'stages',
      stages: [
        {
          dueEnd: '2026-05-05',
          dueEndSetManually: true,
          dueStart: '2026-05-02',
          dueStartSetManually: true,
          stationBookings: [
            {
              dueEnd: '2026-05-05',
              dueStart: '2026-05-02',
            },
          ],
        },
      ],
    });
  });

  test('dragging a draft station booking pins only that booking range', () => {
    const edit = applyCreateScheduleGanttDueRangeEdit({
      anchorKind: 'end',
      nextRange: { dueEnd: '2026-05-04', dueStart: '2026-05-02' },
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
              dueStart: '2026-05-02',
              dueStartSetManually: true,
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
