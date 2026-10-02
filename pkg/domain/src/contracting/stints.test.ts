import type { Assignment, StintPricing } from '@pkg/schema/contracting';
import { describe, expect, it } from 'vitest';
import { groupStints } from './stints.js';

function stint(
  id: string,
  machineId: string,
  machineCode: string,
  capturedAt: string | null,
  workHours: number,
  travelHours: number,
  finalAmount: number | null,
  createdAt = capturedAt ?? '2026-09-04T08:00:00Z',
): Assignment {
  return {
    id,
    machineId,
    machineCode,
    createdAt,
    state: capturedAt ? 'left' : 'planned',
    arrival: capturedAt ? { capturedAt } : null,
    workHours,
    travelHours,
    measures: [],
    pricing: finalAmount === null ? null : ({ kind: 'rate', finalAmount } as StintPricing),
  } as unknown as Assignment;
}

describe('groupStints', () => {
  it('groups repeat stints by first arrival, subtotals a repeated Machine, and lists planned stints apart', () => {
    const later = stint('a2', 'a', 'CAT-1', '2026-09-03T08:00:00Z', 4, 1, 2400.1);
    const first = stint('a1', 'a', 'CAT-1', '2026-09-01T08:00:00Z', 3, 2, 1800);
    const other = stint('b1', 'b', 'GRAD-1', '2026-09-02T08:00:00Z', 8, 0, null);
    const planned = stint('p1', 'c', 'JD-1', null, 0, 0, null);
    expect(groupStints([later, other, planned, first])).toEqual({
      machines: [
        {
          machineId: 'a',
          machineCode: 'CAT-1',
          stints: [first, later],
          subtotal: { workHours: 7, travelHours: 3, amount: 4200.1 },
        },
        { machineId: 'b', machineCode: 'GRAD-1', stints: [other], subtotal: null },
      ],
      planned: [planned],
    });
  });

  it('sorts planned stints by creation', () => {
    const newer = stint('p2', 'c', 'JD-1', null, 0, 0, null, '2026-09-05T08:00:00Z');
    const older = stint('p1', 'd', 'JD-2', null, 0, 0, null, '2026-09-04T08:00:00Z');
    expect(groupStints([newer, older]).planned).toEqual([older, newer]);
  });
});
