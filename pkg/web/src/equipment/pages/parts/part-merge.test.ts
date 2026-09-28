import type { PartMergePreview } from '@pkg/schema/equipment';
import { describe, expect, it } from 'vitest';

import { describePartMergeBlocker, formatPartMergeMoves, formatPartMergeStock } from './part-merge.js';

const preview: PartMergePreview = {
  blockers: [],
  combinedAverageUnitCost: 80,
  combinedOnHand: 3,
  droppedBomLineCount: 0,
  moved: { bomLines: 0, jobs: 1, productLines: 2, purchaseOrderLines: 1, stockMovements: 12 },
  source: { averageUnitCost: 120, code: 'TUBE-OLD', id: 'a', name: 'Tube', onHand: 1 },
  summed: [],
  target: { averageUnitCost: 60, code: 'TUBE', id: 'b', name: 'Tube', onHand: 2 },
  unitOfMeasure: 'mm',
};

describe('describePartMergeBlocker', () => {
  it('names the orders the user has to deal with', () => {
    expect(
      describePartMergeBlocker({ kind: 'same-purchase-order', purchaseOrderCodes: ['PO-00004', 'PO-00009'] }),
    ).toBe('Both Parts are on PO-00004, PO-00009. Remove one of the lines first.');
  });

  it('names the stocktake to close', () => {
    expect(describePartMergeBlocker({ kind: 'open-stocktake', scope: 'raw-material' })).toBe(
      'Close the Raw material stocktake first.',
    );
  });
});

describe('formatPartMergeMoves', () => {
  it('says what moves, that the duplicate goes, and that its code stops scanning', () => {
    expect(formatPartMergeMoves(preview)).toBe(
      '12 stock movements, 1 purchase order line, 0 BOM lines, 2 product lines and 1 job will move to TUBE. TUBE-OLD will be deleted and its label will no longer scan. This cannot be undone.',
    );
  });
});

describe('formatPartMergeStock', () => {
  it('shows each side and the total in the Part’s unit, with cost only when it is visible', () => {
    expect(formatPartMergeStock(preview)).toEqual([
      { average: 'R 120.00', label: 'TUBE-OLD', onHand: '1 pieces' },
      { average: 'R 60.00', label: 'TUBE', onHand: '2 pieces' },
      { average: 'R 80.00', label: 'After merge', onHand: '3 pieces' },
    ]);
    expect(formatPartMergeStock({ ...preview, combinedAverageUnitCost: null, unitOfMeasure: 'kg' }).at(-1)).toEqual({
      average: null,
      label: 'After merge',
      onHand: '3 kg',
    });
  });
});
