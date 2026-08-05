import { DateOnlyIso, type JobSummary } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import {
  getJobCatalogListPresentation,
  getJobSchedulePresentation,
  isJobCatalogSort,
  isJobCompletionFilter,
} from './job-catalog';

describe('Job catalog controls', () => {
  it('accepts only persisted completion and sort values', () => {
    expect(isJobCompletionFilter('exclude-complete')).toBe(true);
    expect(isJobCompletionFilter('include-complete')).toBe(true);
    expect(isJobCatalogSort('schedule')).toBe(true);
    expect(isJobCatalogSort('code')).toBe(true);

    for (const value of ['complete', 'days-left', null, undefined, 1]) {
      expect(isJobCompletionFilter(value)).toBe(false);
      expect(isJobCatalogSort(value)).toBe(false);
    }
  });

  it('maps the default controls to the web Job List query', () => {
    expect(getJobCatalogListPresentation('exclude-complete', 'schedule')).toEqual({
      filters: { incompleteOnly: true },
      include: { scheduleState: true },
      sortBy: 'scheduledSlots',
      sortDirection: 'asc',
    });
  });

  it('includes completed Jobs and sorts codes ascending when selected', () => {
    expect(getJobCatalogListPresentation('include-complete', 'code')).toEqual({
      filters: {},
      include: { scheduleState: true },
      sortBy: 'code',
      sortDirection: 'asc',
    });
  });
});

describe('Job schedule presentation', () => {
  const job = (input: Partial<JobSummary>): JobSummary =>
    ({ completedOn: null, scheduleState: null, ...input }) as JobSummary;

  it('keeps stored completion distinct from projected schedule completion', () => {
    expect(
      getJobSchedulePresentation(
        job({ completedOn: DateOnlyIso.parse('2026-08-05'), scheduleState: schedule({ done: 2, total: 2 }) }),
      ),
    ).toEqual([{ count: 2, label: 'Done', tone: 'gray' }]);
  });

  it('matches the web labels and lifecycle order', () => {
    expect(getJobSchedulePresentation(job({ scheduleState: schedule({ total: 0 }) }))).toEqual([
      { count: null, label: 'Not scheduled', tone: 'orange' },
    ]);
    expect(
      getJobSchedulePresentation(job({ scheduleState: schedule({ active: 1, done: 2, scheduled: 3, total: 6 }) })),
    ).toEqual([
      { count: 2, label: 'Done', tone: 'gray' },
      { count: 1, label: 'Active', tone: 'blue' },
      { count: 3, label: 'Scheduled', tone: 'green' },
    ]);
  });
});

function schedule(input: Partial<NonNullable<JobSummary['scheduleState']>>): NonNullable<JobSummary['scheduleState']> {
  return {
    active: 0,
    done: 0,
    firstWorkDay: null,
    lastWorkDay: null,
    scheduled: 0,
    total: 0,
    ...input,
  };
}
