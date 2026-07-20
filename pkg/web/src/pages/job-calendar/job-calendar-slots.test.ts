import { ProjectedBayQueue } from '@pkg/schema';
import { expect, test } from 'vitest';

import { buildJobSummary } from '@/test/job-fixtures.js';

import { groupJobCalendarSlotsByDate } from './job-calendar-slots.js';

test('groups retained cancelled slots by calendar day with their cancellation state', () => {
  const job = buildJobSummary({ cancelledAt: '2026-07-17T08:00:00.000Z' });
  const bay = ProjectedBayQueue.parse({
    calendarExceptions: [],
    createdAt: '2026-07-17T08:00:00.000Z',
    currentOperator: null,
    department: 'fabrication',
    disabledAt: null,
    id: '40000000-0000-4000-8000-000000000000',
    name: 'Fabrication Bay 1',
    nextAvailableDate: '2026-07-19',
    scheduleOrigin: '2026-07-17',
    slots: [
      {
        bayId: '40000000-0000-4000-8000-000000000000',
        createdAt: '2026-07-17T08:00:00.000Z',
        durationDays: 2,
        endDate: '2026-07-19',
        firstWorkDay: '2026-07-17',
        id: '50000000-0000-4000-8000-000000000000',
        jobCode: 'JOB-00001',
        jobId: job.id,
        jobUnfinished: true,
        kind: 'work',
        label: null,
        lastWorkDay: '2026-07-18',
        sequence: 1,
        startDate: '2026-07-17',
        state: 'active',
        updatedAt: '2026-07-17T08:00:00.000Z',
      },
    ],
    updatedAt: '2026-07-17T08:00:00.000Z',
  });

  const grouped = groupJobCalendarSlotsByDate([bay], [job]);

  expect(grouped.get('2026-07-17')).toEqual([
    {
      bayName: 'Fabrication Bay 1',
      cancelled: true,
      jobCode: 'JOB-00001',
      jobId: job.id,
      slotId: '50000000-0000-4000-8000-000000000000',
    },
  ]);
  expect(grouped.get('2026-07-18')).toEqual(grouped.get('2026-07-17'));
  expect(grouped.has('2026-07-19')).toBe(false);
});
