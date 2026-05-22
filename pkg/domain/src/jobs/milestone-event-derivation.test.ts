import { describe, expect, it } from 'vitest';

import { deriveMilestoneEvents } from './milestone-event-derivation.js';

describe('deriveMilestoneEvents', () => {
  it('emits stage.started and job.started when actual window starts flip absent to present', () => {
    expect(
      deriveMilestoneEvents({
        job: {
          after: { end: null, start: dateTime('2026-05-21T08:00:00.000Z') },
          before: { end: null, start: null },
        },
        stage: {
          after: { end: null, start: dateTime('2026-05-21T08:00:00.000Z') },
          before: { end: null, start: null },
        },
      }),
    ).toEqual(['stage.started', 'job.started']);
  });

  it('emits stage.ended and job.completed when actual window ends flip absent to present', () => {
    expect(
      deriveMilestoneEvents({
        job: {
          after: { end: dateTime('2026-05-21T12:00:00.000Z'), start: dateTime('2026-05-21T08:00:00.000Z') },
          before: { end: null, start: dateTime('2026-05-21T08:00:00.000Z') },
        },
        stage: {
          after: { end: dateTime('2026-05-21T12:00:00.000Z'), start: dateTime('2026-05-21T08:00:00.000Z') },
          before: { end: null, start: dateTime('2026-05-21T08:00:00.000Z') },
        },
      }),
    ).toEqual(['stage.ended', 'job.completed']);
  });

  it('emits nothing when no endpoint flips absent to present', () => {
    expect(
      deriveMilestoneEvents({
        job: {
          after: { end: null, start: dateTime('2026-05-21T08:00:00.000Z') },
          before: { end: null, start: dateTime('2026-05-21T08:00:00.000Z') },
        },
        stage: {
          after: { end: null, start: null },
          before: { end: null, start: null },
        },
      }),
    ).toEqual([]);
  });
});

function dateTime(value: string): Date {
  return new Date(value);
}
