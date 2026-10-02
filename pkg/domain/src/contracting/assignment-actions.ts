import type { AssignmentState } from '@pkg/schema/contracting';

/** What a Machine Assignment's state allows, whoever asks. The Job Action is judged first. */
export const assignmentActionNames = ['remove', 'changeResources', 'editMeasures', 'resolveGap', 'price'] as const;
export type AssignmentActionName = (typeof assignmentActionNames)[number];

export type AssignmentActionVerdict = { allowed: true } | { allowed: false; message: string };

const rules: Record<AssignmentActionName, { states: readonly AssignmentState[]; refusal: string }> = {
  remove: { states: ['planned'], refusal: 'Only a planned Machine Assignment can be removed.' },
  changeResources: {
    states: ['planned', 'on-site'],
    refusal: 'The Implement and Driver cannot change after the Machine has left.',
  },
  editMeasures: {
    states: ['on-site', 'left'],
    refusal: 'Measures can only be recorded after the Machine has arrived.',
  },
  resolveGap: { states: ['left'], refusal: 'The Machine Assignment must have left the Job.' },
  price: { states: ['left'], refusal: 'Only a Machine Assignment that has left can be priced.' },
};

export function judgeAssignmentAction(
  action: AssignmentActionName,
  assignment: { state: AssignmentState },
): AssignmentActionVerdict {
  const rule = rules[action];
  return rule.states.includes(assignment.state) ? { allowed: true } : { allowed: false, message: rule.refusal };
}
