import { describe, expect, it } from 'vitest';

import { getStageStatusChangeCopy } from './workflow-history-copy.js';

describe('workflow history copy', () => {
  it('describes paint curing in end-user language', () => {
    expect(
      getStageStatusChangeCopy({
        fromStatus: 'painting',
        stage: 'paint',
        toStatus: 'curing',
      }),
    ).toEqual({
      label: 'Paint started curing',
      metadata: 'After painting completed',
    });
  });

  it('describes non-paint status changes without technical diffs', () => {
    expect(
      getStageStatusChangeCopy({
        fromStatus: 'welding',
        stage: 'fabrication',
        toStatus: 'qc',
      }),
    ).toEqual({
      label: 'Fabrication moved to QC',
      metadata: 'After welding completed',
    });
  });

  it('keeps unexpected stage and status pairings readable', () => {
    expect(
      getStageStatusChangeCopy({
        fromStatus: 'qc',
        stage: 'assembly',
        toStatus: 'cutting',
      }),
    ).toEqual({
      label: 'Assembly moved to Cutting',
      metadata: 'After QC completed',
    });
  });
});
