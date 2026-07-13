import { describe, expect, it } from 'vitest';

import { filterBookSlotJobs, getDefaultSlotDurationDays } from './book-slot-jobs.js';

describe('getDefaultSlotDurationDays', () => {
  it('uses the Product build time for an unscheduled Product Job', () => {
    expect(
      getDefaultSlotDurationDays({
        productBuildTimeDays: 12,
        scheduleState: { active: 0, done: 0, endDate: null, scheduled: 0, startDate: null, total: 0 },
      }),
    ).toBe(12);
  });

  it('uses one day when the Job already has a Work Slot', () => {
    expect(
      getDefaultSlotDurationDays({
        productBuildTimeDays: 12,
        scheduleState: { active: 0, done: 0, endDate: null, scheduled: 1, startDate: null, total: 1 },
      }),
    ).toBe(1);
  });

  it('uses one day for an unscheduled Custom Job without a Product preset', () => {
    expect(
      getDefaultSlotDurationDays({
        productBuildTimeDays: null,
        scheduleState: { active: 0, done: 0, endDate: null, scheduled: 0, startDate: null, total: 0 },
      }),
    ).toBe(1);
  });
});

describe('filterBookSlotJobs', () => {
  it('keeps every Job when showing all jobs', () => {
    const jobs = [
      { id: 'unscheduled', scheduleState: scheduleState({ total: 0 }) },
      { id: 'active', scheduleState: scheduleState({ scheduled: 1, total: 1 }) },
    ];

    expect(filterBookSlotJobs(jobs, 'all')).toEqual(jobs);
  });

  it('keeps unfinished scheduled Jobs when showing active jobs', () => {
    const jobs = [
      { id: 'unscheduled', scheduleState: scheduleState({ total: 0 }) },
      { id: 'in-progress', scheduleState: scheduleState({ active: 1, total: 1 }) },
      { id: 'upcoming', scheduleState: scheduleState({ scheduled: 1, total: 1 }) },
      { id: 'complete', scheduleState: scheduleState({ done: 1, total: 1 }) },
    ];

    expect(filterBookSlotJobs(jobs, 'active').map((job) => job.id)).toEqual(['in-progress', 'upcoming']);
  });

  it('keeps only Jobs without Work Slots when showing unscheduled jobs', () => {
    const jobs = [
      { id: 'unscheduled', scheduleState: scheduleState({ total: 0 }) },
      { id: 'scheduled', scheduleState: scheduleState({ scheduled: 1, total: 1 }) },
    ];

    expect(filterBookSlotJobs(jobs, 'unscheduled').map((job) => job.id)).toEqual(['unscheduled']);
  });
});

function scheduleState(overrides: Partial<{ active: number; done: number; scheduled: number; total: number }>) {
  return {
    active: 0,
    done: 0,
    endDate: null,
    scheduled: 0,
    startDate: null,
    total: 0,
    ...overrides,
  };
}
