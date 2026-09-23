import type { Assignment } from '@pkg/schema/contracting';
import { describe, expect, it } from 'vitest';
import { groupStints, plannedNeverArrived } from './stints.js';

function stint(
  id: string,
  machineId: string,
  machineCode: string,
  capturedAt: string | null,
  workHours: number,
  travelHours: number,
  quantity: number,
): Assignment {
  return {
    id,
    machineId,
    machineCode,
    createdAt: capturedAt ?? '2026-09-04T08:00:00Z',
    state: capturedAt ? 'left' : 'planned',
    arrival: capturedAt ? { capturedAt } : null,
    workHours,
    travelHours,
    measures: quantity ? [{ measureTypeName: 'Loads', quantity }] : [],
  } as Assignment;
}

describe('groupStints', () => {
  it('groups repeat stints by first arrival and totals each Machine only when repeated', () => {
    const later = stint('a2', 'a', 'CAT-1', '2026-09-03T08:00:00Z', 4, 1, 6);
    const first = stint('a1', 'a', 'CAT-1', '2026-09-01T08:00:00Z', 3, 2, 5);
    const other = stint('b1', 'b', 'GRAD-1', '2026-09-02T08:00:00Z', 8, 0, 0);
    const planned = stint('p1', 'c', 'JD-1', null, 0, 0, 0);
    expect(groupStints([later, other, planned, first])).toEqual([
      { kind: 'stint', stint: first, firstOfMachine: true },
      { kind: 'stint', stint: later, firstOfMachine: false },
      { kind: 'subtotal', machineCode: 'CAT-1', workHours: 7, travelHours: 3, measures: { Loads: 11 } },
      { kind: 'stint', stint: other, firstOfMachine: true },
      { kind: 'planned', stint: planned },
    ]);
    expect(plannedNeverArrived([first, planned])).toEqual([planned]);
  });
});
