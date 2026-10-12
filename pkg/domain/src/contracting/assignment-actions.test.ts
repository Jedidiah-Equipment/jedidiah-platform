import {
  type AssignmentActionName,
  type AssignmentState,
  assignmentActionNames,
  type JobActionVerdict,
} from '@pkg/schema/contracting';
import { describe, expect, test } from 'vitest';
import { judgeAssignmentAction } from './assignment-actions.js';

const states: AssignmentState[] = ['planned', 'on-site', 'left'];
const allowed: JobActionVerdict = { allowed: true };

/** One column per state, in the order planned, on-site, left. ✓ allowed · refused. */
const matrix: Record<AssignmentActionName, string> = {
  remove: '✓··',
  changeResources: '✓✓·',
  captureArrival: '✓··',
  captureDeparture: '·✓·',
  editMeasures: '·✓✓',
  resolveGap: '··✓',
  price: '··✓',
};

describe('judgeAssignmentAction', () => {
  test('judges every Assignment Action in every state once the Job allows it', () => {
    for (const action of assignmentActionNames) {
      const judged = states
        .map((state) => (judgeAssignmentAction(action, allowed, { state }).allowed ? '✓' : '·'))
        .join('');
      expect({ action, judged }).toEqual({ action, judged: matrix[action] });
    }
  });

  test('refuses a wrong state with the rule its own sentence', () => {
    expect(judgeAssignmentAction('remove', allowed, { state: 'on-site' })).toEqual({
      allowed: false,
      reason: 'wrong-state',
      message: 'Only a planned Machine Assignment can be removed.',
    });
    expect(judgeAssignmentAction('captureDeparture', allowed, { state: 'planned' })).toEqual({
      allowed: false,
      reason: 'wrong-state',
      message: 'This Machine Assignment is not on site.',
    });
  });

  test('passes a refused Job verdict through untouched', () => {
    const refused = {
      allowed: false,
      reason: 'not-your-job',
      message: 'This Job is assigned to another Foreman.',
    } as const;
    expect(judgeAssignmentAction('remove', refused, { state: 'planned' })).toEqual(refused);
  });
});
