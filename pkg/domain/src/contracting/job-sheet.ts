import type { AssignmentDetail, JobDetail } from '@pkg/schema/contracting';
import { actionSheet } from './action-verdicts.js';
import { hasJobCard } from './job-card.js';
import { assignmentStateDisplayOrder, groupStints } from './stints.js';

/**
 * The signed-in person's reading of one Job on a screen, read the same way by web and phone. Two tiers of control:
 * - Card actions (a card's own button) take `action(name)`: nothing when the person lacks the permission, otherwise
 *   disabled with the server's own refusal while the Job refuses it.
 * - Row controls (icon buttons and inline cells inside a stint card or table row) render only while `can` is true,
 *   and a value that is on display renders read-only.
 *
 * A stint entry carries only its own Assignment Actions; Job Actions on a stint card (`reportBreakdown`,
 * `patchTravel`) still come from the Job's sheet, so which record refuses stays visible.
 */
export function jobSheet(job: JobDetail) {
  const sheet = actionSheet(job.actions);
  const finished = hasJobCard(job.status);
  const started = job.status === 'active' || finished;
  /** Money reaches only the readers the server sends it to, once there is a Job Card to price. */
  const showsMoney = finished && job.seesMoney;
  return {
    ...sheet,
    started,
    finished,
    showsMoney,
    showsSignOff: started && sheet.holds('editSignOffDetails'),
    showsChargeLines: job.status !== 'upcoming' && !showsMoney,
    showsInvoice: showsMoney && (job.status === 'priced' || job.status === 'invoiced'),
    stints: screenOrder(job.assignments),
  };
}

export type JobSheet = ReturnType<typeof jobSheet>;
export type JobSheetStint = JobSheet['stints'][number];

/** What is on site, then what is coming, then what has left; each tier in `groupStints` order, numbered per Machine. */
function screenOrder(assignments: readonly AssignmentDetail[]) {
  const { machines, planned } = groupStints(assignments);
  const numbers = new Map<string, number>();
  return [...machines.flatMap((machine) => machine.stints), ...planned]
    .map((stint) => {
      const number = (numbers.get(stint.machineId) ?? 0) + 1;
      numbers.set(stint.machineId, number);
      return { stint, number, sheet: actionSheet(stint.actions) };
    })
    .sort(
      (left, right) => assignmentStateDisplayOrder[left.stint.state] - assignmentStateDisplayOrder[right.stint.state],
    );
}
