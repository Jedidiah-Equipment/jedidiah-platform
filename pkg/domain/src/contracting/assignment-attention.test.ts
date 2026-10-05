import { jobReadingAttentionKinds } from '@pkg/schema/contracting';
import { describe, expect, it } from 'vitest';
import {
  assignmentAttentionItems,
  assignmentAttentionKindLabels,
  assignmentAttentionKindLevels,
  assignmentNeedsALookLevel,
  countedAssignmentAttentionLevel,
  highestAssignmentAttentionLevel,
  jobAssignmentAttentionCounts,
} from './assignment-attention.js';

describe('assignment attention', () => {
  it('gives every reading kind and the Gap Flag a level and a label', () => {
    for (const kind of ['gap-flag', ...jobReadingAttentionKinds] as const) {
      expect(assignmentAttentionKindLevels[kind]).toBeDefined();
      expect(assignmentAttentionKindLabels[kind]).toBeTruthy();
    }
  });

  it('ranks notice below warning below critical', () => {
    expect(highestAssignmentAttentionLevel([])).toBeNull();
    expect(highestAssignmentAttentionLevel(['notice', 'critical', 'warning'])).toBe('critical');
  });

  it('lists the Gap Flag before each reading kind, and needs a look only for warning and critical', () => {
    const assignment = {
      gapFlag: true,
      arrival: { attention: ['missing-photo'] as const },
      departure: { attention: ['ai-disagrees'] as const },
    };
    expect(assignmentAttentionItems(assignment)).toEqual([
      { kind: 'gap-flag', level: 'critical' },
      { kind: 'missing-photo', level: 'notice' },
      { kind: 'ai-disagrees', level: 'warning' },
    ]);
    expect(assignmentNeedsALookLevel(assignment)).toBe('critical');
    expect(
      assignmentNeedsALookLevel({
        gapFlag: false,
        arrival: { attention: ['missing-photo', 'ai-pending'] },
        departure: null,
      }),
    ).toBeNull();
  });

  it('counts open Gap Flags as critical and shows the loudest counted level', () => {
    const counts = jobAssignmentAttentionCounts(2, { critical: 0, warning: 1 });
    expect(counts).toEqual({ critical: 2, warning: 1 });
    expect(countedAssignmentAttentionLevel(counts)).toBe('critical');
    expect(countedAssignmentAttentionLevel({ critical: 0, warning: 1 })).toBe('warning');
    expect(countedAssignmentAttentionLevel({ critical: 0, warning: 0 })).toBeNull();
  });
});
