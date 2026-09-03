import { describe, expect, it } from 'vitest';

import { describeSlotRelease, describeUnit } from '@/equipment/components/common/cancellation.js';

describe('cancellation copy', () => {
  it('names how many bay slots come back, and says none are owed when there are none', () => {
    expect(describeSlotRelease(0)).toContain('no upcoming slots to release');
    expect(describeSlotRelease(1)).toContain('1 upcoming slot is removed');
    expect(describeSlotRelease(3)).toContain('3 upcoming slots are removed');
  });

  it('names who holds the machine so nobody removes a serial blind', () => {
    expect(
      describeUnit({
        canRemove: true,
        ownerName: 'Acme Mining',
        productSerialNumber: 'CFO-001-26-1',
        productUnitId: '00000000-0000-4000-8000-000000001042',
        removeByDefault: true,
      }),
    ).toContain('Acme Mining currently holds it.');
    expect(
      describeUnit({
        canRemove: true,
        ownerName: null,
        productSerialNumber: 'CFO-001-26-1',
        productUnitId: '00000000-0000-4000-8000-000000001042',
        removeByDefault: true,
      }),
    ).toContain('It is held as stock.');
  });
});
