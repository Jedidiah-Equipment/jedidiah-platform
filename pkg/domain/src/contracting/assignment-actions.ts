import {
  type AssignmentActionName,
  type AssignmentActions,
  type AssignmentActionVerdict,
  type AssignmentState,
  assignmentActionNames,
  assignmentStates,
  type JobActionName,
  type JobActions,
  type JobActionVerdict,
} from '@pkg/schema/contracting';

/** The Job Action every Assignment Action is judged under first. */
export const assignmentActionJobAction: Record<AssignmentActionName, JobActionName> = {
  remove: 'removeAssignment',
  changeResources: 'assign',
  captureArrival: 'capture',
  captureDeparture: 'capture',
  editMeasures: 'editMeasures',
  editHours: 'editHours',
  setTravel: 'setTravel',
  dismissAttention: 'dismissAttention',
  price: 'price',
};

const rules: Record<AssignmentActionName, { states: readonly AssignmentState[]; refusal: string }> = {
  remove: { states: assignmentStates, refusal: 'This Machine Assignment cannot be removed.' },
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
  dismissAttention: { states: ['on-site', 'left'], refusal: 'Warnings exist once the Machine has arrived.' },
  price: { states: ['left'], refusal: 'Only a Machine Assignment that has left can be priced.' },
};

const assignmentStateAllows = (action: AssignmentActionName, state: AssignmentState): boolean =>
  rules[action].states.includes(state);

/** Job Action first, then the Assignment's state; a refused Job verdict passes through with its own reason. */
export function judgeAssignmentAction(
  action: AssignmentActionName,
  jobVerdict: JobActionVerdict,
  assignment: { state: AssignmentState },
): AssignmentActionVerdict {
  if (!jobVerdict.allowed) return jobVerdict;
  return assignmentStateAllows(action, assignment.state)
    ? { allowed: true }
    : { allowed: false, reason: 'wrong-state', message: rules[action].refusal };
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

export const REMOVAL_REASON_REQUIRED = 'A reason is required once the Machine has arrived.';

/** Removing a stint that has arrived deletes its hours, so it takes a reason; a planned one needs none. */
export const removalNeedsReason = (state: AssignmentState) => state !== 'planned';

export type AssignmentRemovalVerdict =
  | { ok: true }
  | { ok: false; refusal: { code: 'contracting_job.reason_required'; message: string } };

/** Whether a removal carries what it must, for the server and both removal dialogs alike. */
export function judgeAssignmentRemoval(
  assignment: { state: AssignmentState },
  reason: string | null | undefined,
): AssignmentRemovalVerdict {
  return removalNeedsReason(assignment.state) && !reason?.trim()
    ? { ok: false, refusal: { code: 'contracting_job.reason_required', message: REMOVAL_REASON_REQUIRED } }
    : { ok: true };
}
