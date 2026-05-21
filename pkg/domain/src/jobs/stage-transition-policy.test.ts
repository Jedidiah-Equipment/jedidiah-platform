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
    ).toEqual(['start', 'stop']);
  });

  it.each([
    ['admin', 'pending after previous completion', true, false],
    ['admin', 'pending before previous completion', false, false],
    ['admin', 'in progress', false, true],
    ['admin', 'complete', false, false],
    ['job-supervisor', 'pending after previous completion', true, false],
    ['job-supervisor', 'pending before previous completion', false, false],
    ['job-supervisor', 'in progress', false, true],
    ['job-supervisor', 'complete', false, false],
    ['job-department-manager:owned', 'pending after previous completion', true, false],
    ['job-department-manager:owned', 'pending before previous completion', false, false],
    ['job-department-manager:owned', 'in progress', false, true],
    ['job-department-manager:owned', 'complete', false, false],
    ['job-department-manager:other', 'pending after previous completion', false, false],
    ['job-department-manager:other', 'pending before previous completion', false, false],
    ['job-department-manager:other', 'in progress', false, false],
    ['job-department-manager:other', 'complete', false, false],
    ['sales', 'pending after previous completion', false, false],
    ['sales', 'pending before previous completion', false, false],
    ['sales', 'in progress', false, false],
    ['sales', 'complete', false, false],
  ] as const)('evaluates %s access for a %s stage', (accessFixture, stageFixture, expectedStartAllowed, expectedStopAllowed) => {
    const availability = getStageTransitionAvailability({
      access: createAccess(accessFixture),
      job: baseJob,
      previousStage:
        stageFixture === 'pending before previous completion'
          ? { actualEnd: null }
          : { actualEnd: '2026-05-15T07:00:00.000Z' },
      stage: createPolicyStage(stageFixture),
    });

    expect(availability.start.allowed).toBe(expectedStartAllowed);
    expect(availability.stop.allowed).toBe(expectedStopAllowed);
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

function createAccess(
  fixture: 'admin' | 'job-department-manager:other' | 'job-department-manager:owned' | 'job-supervisor' | 'sales',
) {
  switch (fixture) {
    case 'job-department-manager:owned':
      return createUserAccessSummary({ departments: ['paint'], role: 'job-department-manager', userId: fixture });
    case 'job-department-manager:other':
      return createUserAccessSummary({ departments: ['supply'], role: 'job-department-manager', userId: fixture });
    default:
      return createUserAccessSummary({ role: fixture, userId: fixture });
  }
}

function createPolicyStage(
  fixture: 'complete' | 'in progress' | 'pending after previous completion' | 'pending before previous completion',
) {
  switch (fixture) {
    case 'complete':
      return createStage({
        actualEnd: '2026-05-15T09:00:00.000Z',
        actualStart: '2026-05-15T08:00:00.000Z',
        sequence: 4,
        stage: 'paint',
      });
    case 'in progress':
      return createStage({
        actualEnd: null,
        actualStart: '2026-05-15T08:00:00.000Z',
        sequence: 4,
        stage: 'paint',
      });
    default:
      return createStage({ actualEnd: null, actualStart: null, sequence: 4, stage: 'paint' });
  }
}
