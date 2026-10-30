import {
  type AssignmentActionName,
  type AssignmentActions,
  type AssignmentActionVerdict,
  type AssignmentState,
  assignmentActionNames,
  type JobActionName,
  type JobActions,
  type JobActionVerdict,
} from '@pkg/schema/contracting';

/** The Job Action every Assignment Action is judged under first. */
export const assignmentActionJobAction: Record<AssignmentActionName, JobActionName> = {
  remove: 'assign',
  changeResources: 'assign',
  captureArrival: 'capture',
  captureDeparture: 'capture',
  editMeasures: 'editMeasures',
  editHours: 'editHours',
  setTravel: 'setTravel',
  price: 'price',
};

const rules: Record<AssignmentActionName, { states: readonly AssignmentState[]; refusal: string }> = {
  remove: { states: ['planned'], refusal: 'Only a planned Machine Assignment can be removed.' },
  changeResources: {
    states: ['planned', 'on-site'],
    refusal: 'The Implement and Driver cannot change after the Machine has left.',
  },
  captureArrival: { states: ['planned'], refusal: 'This Machine Assignment already arrived.' },
  captureDeparture: { states: ['on-site'], refusal: 'This Machine Assignment is not on site.' },
  editMeasures: {
    states: ['on-site', 'left'],
    refusal: 'Measures can only be recorded after the Machine has arrived.',
  },
  editHours: { states: ['on-site', 'left'], refusal: 'The Machine has not arrived yet.' },
  setTravel: { states: ['on-site', 'left'], refusal: 'Travel Hours exist once the Machine has arrived.' },
  price: { states: ['left'], refusal: 'Only a Machine Assignment that has left can be priced.' },
};

/** The state half alone: what this Assignment's state allows, whoever asks. */
export const assignmentStateAllows = (action: AssignmentActionName, state: AssignmentState): boolean =>
  rules[action].states.includes(state);

export const assignmentActionRefusal = (action: AssignmentActionName): string => rules[action].refusal;

/** Job Action first, then the Assignment's state; a refused Job verdict passes through with its own reason. */
export function judgeAssignmentAction(
  action: AssignmentActionName,
  jobVerdict: JobActionVerdict,
  assignment: { state: AssignmentState },
): AssignmentActionVerdict {
  if (!jobVerdict.allowed) return jobVerdict;
  return assignmentStateAllows(action, assignment.state)
    ? { allowed: true }
    : { allowed: false, reason: 'wrong-state', message: assignmentActionRefusal(action) };
}

/** Every Assignment Action verdict for one Machine Assignment, read off the Job's served verdicts. */
export function deriveAssignmentActions(
  jobActions: JobActions,
  assignment: { state: AssignmentState },
): AssignmentActions {
  return Object.fromEntries(
    assignmentActionNames.map((action) => [
      action,
      judgeAssignmentAction(action, jobActions[assignmentActionJobAction[action]], assignment),
    ]),
  ) as AssignmentActions;
}
