import { jobReadingAttentionKinds } from '@pkg/schema/contracting';
import { describe, expect, it } from 'vitest';
import {
  assignmentAttentionItems,
  assignmentAttentionKindLabels,
  assignmentAttentionKindLevels,
  assignmentNeedsALookLevel,
  countedAssignmentAttentionLevel,
  jobAssignmentAttentionCounts,
} from './assignment-attention.js';

describe('assignment attention', () => {
  it('gives every reading kind and the Gap Flag a level and a label', () => {
    for (const kind of ['gap-flag', ...jobReadingAttentionKinds] as const) {
      expect(assignmentAttentionKindLevels[kind]).toBeDefined();
      expect(assignmentAttentionKindLabels[kind]).toBeTruthy();
    }
  });

  it('lists the Gap Flag before each Disputed reading, all critical', () => {
    const assignment = { gapFlag: true, arrival: { attention: ['disputed'] as const }, departure: null };
    expect(assignmentAttentionItems(assignment)).toEqual([
      { kind: 'gap-flag', level: 'critical' },
      { kind: 'disputed', level: 'critical' },
    ]);
    expect(assignmentNeedsALookLevel(assignment)).toBe('critical');
    expect(
      assignmentNeedsALookLevel({ gapFlag: false, arrival: { attention: [] }, departure: { attention: [] } }),
    ).toBeNull();
  });

  it('counts open Gap Flags beside Disputed readings', () => {
    const counts = jobAssignmentAttentionCounts(2, { critical: 1 });
    expect(counts).toEqual({ critical: 3 });
    expect(countedAssignmentAttentionLevel(counts)).toBe('critical');
    expect(countedAssignmentAttentionLevel({ critical: 0 })).toBeNull();
  });
});
