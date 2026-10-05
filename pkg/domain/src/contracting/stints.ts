import type { Assignment, AssignmentState } from '@pkg/schema/contracting';
import { round1 } from './hours.js';
import { round2, stintAmount } from './pricing.js';

export type MachineStints = {
  machineId: string;
  machineCode: string;
  stints: Assignment[];
  /** Present only when the Machine has more than one stint. */
  subtotal: { workHours: number; travelHours: number; amount: number } | null;
};

/** The order Machine Assignment cards are listed in: what is on site now, then what is coming, then what has left. */
export const assignmentStateDisplayOrder: Record<AssignmentState, number> = { 'on-site': 0, planned: 1, left: 2 };

/** Arrived stints grouped per Machine in first-arrival order, and the planned ones that never arrived. */
export function groupStints(assignments: readonly Assignment[]): { machines: MachineStints[]; planned: Assignment[] } {
  const visited = new Map<string, Assignment[]>();
  for (const stint of assignments) {
    if (stint.state === 'planned') continue;
    const group = visited.get(stint.machineId) ?? [];
    group.push(stint);
    visited.set(stint.machineId, group);
  }
  const firstArrival = (group: Assignment[]) =>
    group.reduce((earliest, stint) => {
      const arrival = stint.arrival?.capturedAt ?? '';
      return earliest === '' || (arrival !== '' && arrival < earliest) ? arrival : earliest;
    }, '');
  const groups = [...visited.values()].sort(
    (left, right) =>
      firstArrival(left).localeCompare(firstArrival(right)) ||
      (left[0]?.createdAt ?? '').localeCompare(right[0]?.createdAt ?? ''),
  );
  const machines = groups.map((stints) => {
    stints.sort(
      (left, right) =>
        (left.arrival?.capturedAt ?? '').localeCompare(right.arrival?.capturedAt ?? '') ||
        left.createdAt.localeCompare(right.createdAt),
    );
    return {
      machineId: stints[0]?.machineId ?? '',
      machineCode: stints[0]?.machineCode ?? '',
      stints,
      subtotal:
        stints.length > 1
          ? {
              workHours: round1(stints.reduce((total, stint) => total + (stint.workHours ?? 0), 0)),
              travelHours: round1(stints.reduce((total, stint) => total + stint.travelHours, 0)),
              amount: round2(stints.reduce((total, stint) => total + stintAmount(stint.pricing), 0)),
            }
          : null,
    };
  });
  return {
    machines,
    planned: assignments
      .filter((stint) => stint.state === 'planned')
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
  };
}
