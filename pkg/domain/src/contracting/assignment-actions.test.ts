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
  editHours: '·✓✓',
  setTravel: '·✓✓',
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

  test("refuses a wrong state with the rule's own sentence", () => {
    const sentences: Record<AssignmentActionName, [AssignmentState, string]> = {
      remove: ['on-site', 'Only a planned Machine Assignment can be removed.'],
      changeResources: ['left', 'The Implement and Driver cannot change after the Machine has left.'],
      captureArrival: ['on-site', 'This Machine Assignment already arrived.'],
      captureDeparture: ['planned', 'This Machine Assignment is not on site.'],
      editMeasures: ['planned', 'Measures can only be recorded after the Machine has arrived.'],
      editHours: ['planned', 'The Machine has not arrived yet.'],
      setTravel: ['planned', 'Travel Hours exist once the Machine has arrived.'],
      price: ['on-site', 'Only a Machine Assignment that has left can be priced.'],
    };
    for (const action of assignmentActionNames) {
      const [state, message] = sentences[action];
      expect(judgeAssignmentAction(action, allowed, { state })).toEqual({
        allowed: false,
        reason: 'wrong-state',
        message,
      });
    }
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
