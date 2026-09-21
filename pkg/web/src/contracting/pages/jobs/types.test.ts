import { DateOnlyIso } from '@pkg/schema';
import type { Assignment, JobDetail } from '@pkg/schema/contracting';
import { describe, expect, it } from 'vitest';
import {
  complementGap,
  groupStints,
  jobCapabilities,
  plannedNeverArrived,
  queueTabLabel,
  toCompleteInput,
  toJobCreateInput,
} from './types.js';

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

describe('Job sign-off helpers', () => {
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

  it('complements a rounded Hour Gap without exceeding it', () => {
    expect(complementGap(9.5, 2.46)).toEqual({ travelHours: 2.5, unaccountedHours: 7 });
    expect(complementGap(9.5, 12)).toEqual({ travelHours: 9.5, unaccountedHours: 0 });
  });

  it('maps browser values to create and completion inputs', () => {
    const id = '5f1c2d3e-0001-4a00-8000-000000000001';
    expect(
      toJobCreateInput({ customerId: id, farmId: id, workTypeId: id, description: '  Dam  ', foremanUserId: '' }),
    ).toEqual({
      customerId: id,
      farmId: id,
      workTypeId: id,
      description: 'Dam',
      foremanUserId: null,
    });
    expect(
      toCompleteInput(
        id,
        {
          startDate: DateOnlyIso.parse('2026-09-01'),
          endDate: DateOnlyIso.parse('2026-09-03'),
          dieselLitres: 12.5,
          notes: '  done  ',
        },
        [id],
      ),
    ).toMatchObject({
      id,
      dieselLitres: 12.5,
      notes: 'done',
      removePlannedAssignmentIds: [id],
    });
  });

  it('gates actions by status and permission and labels queue counts', () => {
    const can = () => true;
    expect(jobCapabilities({ status: 'active' } as JobDetail, can)).toMatchObject({
      editSetup: true,
      complete: true,
      editSignOffDetails: false,
      resolveGaps: true,
    });
    expect(jobCapabilities({ status: 'invoiced' } as JobDetail, can)).toMatchObject({
      editSetup: false,
      complete: false,
      amendReadings: false,
      cancel: false,
    });
    expect(queueTabLabel('looks-finished', { 'looks-finished': 2 } as never)).toBe('Looks finished (2)');
  });
});
