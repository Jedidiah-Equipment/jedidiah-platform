import type { AssignmentState } from '@pkg/schema/contracting';
import { describe, expect, test } from 'vitest';
import { type AssignmentActionName, assignmentActionNames, judgeAssignmentAction } from './assignment-actions.js';

const states: AssignmentState[] = ['planned', 'on-site', 'left'];

/** One column per state, in the order planned, on-site, left. ✓ allowed · refused. */
const matrix: Record<AssignmentActionName, string> = {
  remove: '✓··',
  changeResources: '✓✓·',
  editMeasures: '·✓✓',
  resolveGap: '··✓',
  price: '··✓',
};

describe('judgeAssignmentAction', () => {
  test('judges every Assignment Action in every state', () => {
    for (const action of assignmentActionNames) {
      const judged = states.map((state) => (judgeAssignmentAction(action, { state }).allowed ? '✓' : '·')).join('');
      expect({ action, judged }).toEqual({ action, judged: matrix[action] });
    }
  });

  test('says why', () => {
    const refusal = (action: AssignmentActionName, state: AssignmentState) => {
      const verdict = judgeAssignmentAction(action, { state });
      return verdict.allowed ? null : verdict.message;
    };
    expect(refusal('remove', 'on-site')).toBe('Only a planned Machine Assignment can be removed.');
    expect(refusal('changeResources', 'left')).toBe(
      'The Implement and Driver cannot change after the Machine has left.',
    );
    expect(refusal('editMeasures', 'planned')).toBe('Measures can only be recorded after the Machine has arrived.');
    expect(refusal('resolveGap', 'on-site')).toBe('The Machine Assignment must have left the Job.');
    expect(refusal('price', 'on-site')).toBe('Only a Machine Assignment that has left can be priced.');
  });
});
