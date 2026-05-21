import { describe, expect, it } from 'vitest';

import { getStageStatusToastCopy } from './stage-status-toast-copy.js';

describe('getStageStatusToastCopy', () => {
  it('uses stage-specific status copy and shows the exact status change', () => {
    expect(
      getStageStatusToastCopy({
        fromStatus: 'painting',
        stage: 'paint',
        toStatus: 'curing',
      }),
    ).toEqual({
      description: 'Paint changed from Painting to Curing.',
      title: 'Paint started curing',
    });
  });

  it('falls back to the target status when the previous status is unavailable', () => {
    expect(
      getStageStatusToastCopy({
        fromStatus: null,
        stage: 'dispatch',
        toStatus: 'ready',
      }),
    ).toEqual({
      description: 'Dispatch is now showing Ready.',
      title: 'Dispatch moved to Ready',
    });
  });
});
