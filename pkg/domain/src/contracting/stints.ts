import type { Assignment } from '@pkg/schema/contracting';
import { round1 } from './hours.js';

export type StintRow =
  | { kind: 'stint'; stint: Assignment; firstOfMachine: boolean }
  | { kind: 'subtotal'; machineCode: string; workHours: number; travelHours: number; measures: Record<string, number> }
  | { kind: 'planned'; stint: Assignment };

export function plannedNeverArrived(assignments: readonly Assignment[]): Assignment[] {
  return assignments.filter((assignment) => assignment.state === 'planned');
}

export function groupStints(assignments: readonly Assignment[]): StintRow[] {
  const visited = new Map<string, Assignment[]>();
  const arrived = assignments.filter((assignment) => assignment.state !== 'planned');
  for (const stint of arrived) {
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
  const rows: StintRow[] = [];
  for (const group of groups) {
    group.sort(
      (left, right) =>
        (left.arrival?.capturedAt ?? '').localeCompare(right.arrival?.capturedAt ?? '') ||
        left.createdAt.localeCompare(right.createdAt),
    );
    for (const [index, stint] of group.entries()) rows.push({ kind: 'stint', stint, firstOfMachine: index === 0 });
    if (group.length > 1) {
      const measures: Record<string, number> = {};
      for (const stint of group)
        for (const measure of stint.measures)
          measures[measure.measureTypeName] =
            Math.round(((measures[measure.measureTypeName] ?? 0) + measure.quantity) * 100) / 100;
      rows.push({
        kind: 'subtotal',
        machineCode: group[0]?.machineCode ?? '',
        workHours: round1(group.reduce((total, stint) => total + (stint.workHours ?? 0), 0)),
        travelHours: round1(group.reduce((total, stint) => total + stint.travelHours, 0)),
        measures,
      });
    }
  }
  return [
    ...rows,
    ...plannedNeverArrived(assignments)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))
      .map((stint) => ({ kind: 'planned' as const, stint })),
  ];
}
