import { JOB_STAGES, type JobLifecycleStatus, type JobStageName, type UserAccessSummary } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { createUserAccessSummary } from '../auth/authorization.js';
import {
  evaluateStageTransition,
  getStageTransitionAvailability,
  type StageTransition,
} from './stage-transition-policy.js';

const baseJob = {
  lifecycleStatus: 'active',
} as const satisfies { lifecycleStatus: JobLifecycleStatus };

const viewerProfiles = [
  {
    access: createUserAccessSummary({ departments: ['paint'], role: 'job-stage-editor', userId: 'editor-paint' }),
    editablePaint: true,
    name: 'department editor',
  },
  {
    access: createUserAccessSummary({ departments: ['assembly'], role: 'job-stage-editor', userId: 'editor-assembly' }),
    editablePaint: false,
    name: 'other department editor',
  },
  {
    access: createUserAccessSummary({ role: 'job-stage-editor', userId: 'editor-all' }),
    editablePaint: true,
    name: 'unscoped department editor',
  },
  {
    access: createUserAccessSummary({ role: 'job-supervisor', userId: 'supervisor' }),
    editablePaint: true,
    name: 'unscoped supervisor',
  },
  {
    access: createUserAccessSummary({ role: 'admin', userId: 'admin' }),
    editablePaint: true,
    name: 'admin',
  },
  {
    access: createUserAccessSummary({ role: 'job-viewer', userId: 'viewer' }),
    editablePaint: false,
    name: 'viewer',
  },
] satisfies readonly { access: UserAccessSummary; editablePaint: boolean; name: string }[];

const stageStates = [
  {
    completeAllowed: false,
    name: 'not started',
    stage: createStage({ completedAt: null, sequence: 4, stage: 'paint', startedAt: null }),
    startAllowedWhenPreviousComplete: true,
    statusAllowed: false,
  },
  {
    completeAllowed: true,
    name: 'started',
    stage: createStage({ completedAt: null, sequence: 4, stage: 'paint', startedAt: '2026-05-15T08:00:00.000Z' }),
    startAllowedWhenPreviousComplete: false,
    statusAllowed: true,
  },
  {
    completeAllowed: false,
    name: 'completed',
    stage: createStage({
      completedAt: '2026-05-15T09:00:00.000Z',
      sequence: 4,
      stage: 'paint',
      startedAt: '2026-05-15T08:00:00.000Z',
    }),
    startAllowedWhenPreviousComplete: false,
    statusAllowed: true,
  },
] as const;

describe('stage transition policy', () => {
  it('covers stage state by transition type by viewer profile', () => {
    for (const viewer of viewerProfiles) {
      for (const state of stageStates) {
        for (const transition of ['start', 'set-status', 'complete'] satisfies StageTransition[]) {
          const result = evaluateStageTransition({
            access: viewer.access,
            job: baseJob,
            previousStage: { completedAt: '2026-05-15T07:00:00.000Z' },
            stage: state.stage,
            transition,
          });

          const transitionAllowed =
            transition === 'start'
              ? state.startAllowedWhenPreviousComplete
              : transition === 'complete'
                ? state.completeAllowed
                : state.statusAllowed;

          expect(result.allowed, `${viewer.name} ${transition} ${state.name}`).toBe(
            viewer.editablePaint && transitionAllowed,
          );
        }
      }
    }
  });

  it('blocks starting a stage until the previous stage is complete', () => {
    const result = evaluateStageTransition({
      access: createUserAccessSummary({ role: 'job-supervisor', userId: 'supervisor' }),
      job: baseJob,
      previousStage: { completedAt: null },
      stage: createStage({ completedAt: null, sequence: 2, stage: 'fabrication', startedAt: null }),
      transition: 'start',
    });

    expect(result).toEqual({ allowed: false, reason: 'Previous stage is not complete.' });
  });

  it('allows starting the first stage without a previous stage', () => {
    const result = evaluateStageTransition({
      access: createUserAccessSummary({ departments: ['procurement'], role: 'job-stage-editor', userId: 'editor' }),
      job: baseJob,
      previousStage: null,
      stage: createStage({ completedAt: null, sequence: 1, stage: 'procurement', startedAt: null }),
      transition: 'start',
    });

    expect(result).toEqual({ allowed: true, reason: null });
  });

  it('keeps status editable after completion', () => {
    const result = evaluateStageTransition({
      access: createUserAccessSummary({ departments: ['paint'], role: 'job-stage-editor', userId: 'editor' }),
      job: baseJob,
      previousStage: { completedAt: '2026-05-15T07:00:00.000Z' },
      stage: createStage({
        completedAt: '2026-05-15T09:00:00.000Z',
        sequence: 4,
        stage: 'paint',
        startedAt: '2026-05-15T08:00:00.000Z',
      }),
      transition: 'set-status',
    });

    expect(result).toEqual({ allowed: true, reason: null });
  });

  it('blocks writes while the job lifecycle is not active', () => {
    const result = evaluateStageTransition({
      access: createUserAccessSummary({ role: 'job-supervisor', userId: 'supervisor' }),
      job: { lifecycleStatus: 'paused' },
      previousStage: null,
      stage: createStage({ completedAt: null, sequence: 1, stage: 'procurement', startedAt: null }),
      transition: 'start',
    });

    expect(result).toEqual({ allowed: false, reason: 'Job is not active.' });
  });

  it('reports availability for every transition', () => {
    expect(
      Object.keys(
        getStageTransitionAvailability({
          access: createUserAccessSummary({ role: 'job-supervisor', userId: 'supervisor' }),
          job: baseJob,
          previousStage: null,
          stage: createStage({ completedAt: null, sequence: 1, stage: 'procurement', startedAt: null }),
        }),
      ).sort(),
    ).toEqual(['complete', 'set-status', 'start']);
  });
});

function createStage(input: {
  completedAt: string | null;
  sequence: number;
  stage: JobStageName;
  startedAt: string | null;
}) {
  expect(JOB_STAGES).toContain(input.stage);

  return input;
}
