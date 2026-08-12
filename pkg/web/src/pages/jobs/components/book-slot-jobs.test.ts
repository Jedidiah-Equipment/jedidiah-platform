import { DateOnlyIso } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { filterBookSlotJobs, getDefaultSlotDurationDays } from './book-slot-jobs.js';

describe('getDefaultSlotDurationDays', () => {
  it('uses the Product build time for an unscheduled Product Job', () => {
    expect(
      getDefaultSlotDurationDays({
        productBuildTimeDays: 12,
        scheduleState: {
          active: 0,
          done: 0,
          firstWorkDay: null,
          lastWorkDay: null,
          scheduled: 0,
          total: 0,
        },
      }),
    ).toBe(12);
  });

  it('uses one day when the Job already has a Work Slot', () => {
    expect(
      getDefaultSlotDurationDays({
        productBuildTimeDays: 12,
        scheduleState: {
          active: 0,
          done: 0,
          firstWorkDay: null,
          lastWorkDay: null,
          scheduled: 1,
          total: 1,
        },
      }),
    ).toBe(1);
  });

  it('uses one day for an unscheduled Custom Job without a Product preset', () => {
    expect(
      getDefaultSlotDurationDays({
        productBuildTimeDays: null,
        scheduleState: {
          active: 0,
          done: 0,
          firstWorkDay: null,
          lastWorkDay: null,
          scheduled: 0,
          total: 0,
        },
      }),
    ).toBe(1);
  });
});

describe('filterBookSlotJobs', () => {
  it('keeps every Job when showing all jobs', () => {
    const jobs = [job('unscheduled', { total: 0 }), job('active', { scheduled: 1, total: 1 })];

    expect(filterBookSlotJobs(jobs, 'all')).toEqual(jobs);
  });

  it('keeps unfinished scheduled Jobs when showing active jobs', () => {
    const jobs = [
      job('unscheduled', { total: 0 }),
      job('in-progress', { active: 1, total: 1 }),
      job('upcoming', { scheduled: 1, total: 1 }),
      job('complete', { done: 1, total: 1 }),
    ];

    expect(filterBookSlotJobs(jobs, 'active').map((entry) => entry.id)).toEqual(['in-progress', 'upcoming']);
  });

  it('keeps only Jobs without Work Slots when showing unscheduled jobs', () => {
    const jobs = [job('unscheduled', { total: 0 }), job('scheduled', { scheduled: 1, total: 1 })];

    expect(filterBookSlotJobs(jobs, 'unscheduled').map((entry) => entry.id)).toEqual(['unscheduled']);
  });

  it('drops a completed Job from unscheduled jobs, which is the only way one ever leaves that list', () => {
    const jobs = [
      job('open', { total: 0 }),
      { ...job('completed', { total: 0 }), completedOn: DateOnlyIso.parse('2026-08-03') },
    ];

    expect(filterBookSlotJobs(jobs, 'unscheduled').map((entry) => entry.id)).toEqual(['open']);
  });

  it('drops a completed Job from active jobs even while its Work Slots are unfinished', () => {
    const jobs = [
      job('open', { active: 1, total: 1 }),
      { ...job('completed', { active: 1, total: 1 }), completedOn: DateOnlyIso.parse('2026-08-03') },
    ];

    expect(filterBookSlotJobs(jobs, 'active').map((entry) => entry.id)).toEqual(['open']);
  });

  it('still offers a completed Job under all jobs, so a Job marked complete by mistake can be rebooked', () => {
    const jobs = [{ ...job('completed', { total: 0 }), completedOn: DateOnlyIso.parse('2026-08-03') }];

    expect(filterBookSlotJobs(jobs, 'all').map((entry) => entry.id)).toEqual(['completed']);
  });
});

function job(id: string, schedule: Parameters<typeof scheduleState>[0]) {
  return { completedOn: null, id, scheduleState: scheduleState(schedule) };
}

function scheduleState(overrides: Partial<{ active: number; done: number; scheduled: number; total: number }>) {
  return {
    active: 0,
    done: 0,
    firstWorkDay: null,
    lastWorkDay: null,
    scheduled: 0,
    total: 0,
    ...overrides,
  };
}
