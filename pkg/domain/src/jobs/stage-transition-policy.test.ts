import { JOB_STAGES, type JobStageName } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { createUserAccessSummary } from '../auth/authorization.js';
import { evaluateStageTransition, getStageTransitionAvailability } from './stage-transition-policy.js';

const baseJob = {
  isCancelled: false,
  isPaused: false,
};

describe('stage transition policy', () => {
  it('allows department managers to start their stage after the previous stage ends', () => {
    const result = evaluateStageTransition({
      access: createUserAccessSummary({ departments: ['paint'], role: 'job-department-manager', userId: 'editor' }),
      job: baseJob,
      previousStage: { actualEnd: '2026-05-15T07:00:00.000Z' },
      stage: createStage({ actualEnd: null, actualStart: null, sequence: 4, stage: 'paint' }),
      transition: 'start',
    });

    expect(result).toEqual({ allowed: true, reason: null });
  });

  it('blocks starting a stage until the previous stage ends', () => {
    const result = evaluateStageTransition({
      access: createUserAccessSummary({ role: 'job-supervisor', userId: 'supervisor' }),
      job: baseJob,
      previousStage: { actualEnd: null },
      stage: createStage({ actualEnd: null, actualStart: null, sequence: 2, stage: 'supply' }),
      transition: 'start',
    });

    expect(result).toEqual({ allowed: false, reason: 'Previous stage is not complete.' });
  });

  it('allows stopping a started stage', () => {
    const result = evaluateStageTransition({
      access: createUserAccessSummary({ role: 'job-supervisor', userId: 'supervisor' }),
      job: baseJob,
      previousStage: null,
      stage: createStage({
        actualEnd: null,
        actualStart: '2026-05-15T08:00:00.000Z',
        sequence: 1,
        stage: 'procurement',
      }),
      transition: 'stop',
    });

    expect(result).toEqual({ allowed: true, reason: null });
  });

  it('blocks writes while a job is paused or cancelled', () => {
    for (const job of [
      { isCancelled: false, isPaused: true },
      { isCancelled: true, isPaused: false },
    ]) {
      const result = evaluateStageTransition({
        access: createUserAccessSummary({ role: 'job-supervisor', userId: 'supervisor' }),
        job,
        previousStage: null,
        stage: createStage({ actualEnd: null, actualStart: null, sequence: 1, stage: 'procurement' }),
        transition: 'start',
      });

      expect(result.allowed).toBe(false);
    }
  });

  it('reports availability for start and stop', () => {
    expect(
      Object.keys(
        getStageTransitionAvailability({
          access: createUserAccessSummary({ role: 'job-supervisor', userId: 'supervisor' }),
          job: baseJob,
          previousStage: null,
          stage: createStage({ actualEnd: null, actualStart: null, sequence: 1, stage: 'procurement' }),
        }),
      ).sort(),
    ).toEqual(['complete', 'set-status', 'start', 'stop']);
  });
});

function createStage(input: {
  actualEnd: string | null;
  actualStart: string | null;
  sequence: number;
  stage: JobStageName;
}) {
  expect(JOB_STAGES).toContain(input.stage);

  return input;
}
