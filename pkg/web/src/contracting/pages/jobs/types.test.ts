import { DateOnlyIso } from '@pkg/schema';
import { describe, expect, it } from 'vitest';
import { complementGap, queueTabLabel, toCompleteInput, toJobCreateInput } from './types.js';

describe('Job sign-off helpers', () => {
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

  it('labels a queue tab with its count', () => {
    expect(queueTabLabel('looks-finished', { 'looks-finished': 2 } as never)).toBe('Looks finished (2)');
  });
});
