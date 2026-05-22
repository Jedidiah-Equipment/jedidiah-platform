import type { ScheduleRollupWindow } from './schedule-rollup/index.js';

export type MilestoneEventType = 'stage.started' | 'stage.ended' | 'job.started' | 'job.completed';

export type MilestoneWindowPair = {
  after: ScheduleRollupWindow;
  before: ScheduleRollupWindow;
};

export type MilestoneEventDerivationInput = {
  job: MilestoneWindowPair;
  stage: MilestoneWindowPair;
};

export function deriveMilestoneEvents(input: MilestoneEventDerivationInput): MilestoneEventType[] {
  const events: MilestoneEventType[] = [];

  if (flippedPresent(input.stage.before.start, input.stage.after.start)) {
    events.push('stage.started');
  }

  if (flippedPresent(input.stage.before.end, input.stage.after.end)) {
    events.push('stage.ended');
  }

  if (flippedPresent(input.job.before.start, input.job.after.start)) {
    events.push('job.started');
  }

  if (flippedPresent(input.job.before.end, input.job.after.end)) {
    events.push('job.completed');
  }

  return events;
}

function flippedPresent(before: Date | null, after: Date | null): boolean {
  return !before && Boolean(after);
}
