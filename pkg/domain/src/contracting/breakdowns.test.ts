import type { ContractingRole } from '@pkg/schema';
import { describe, expect, test, vi } from 'vitest';
import { createUserAccessSummary } from '../auth/authorization.js';
import { breakdownFirstLine, breakdownReadScope, breakdownsByUrgency, mostUrgentBreakdown } from './breakdowns.js';

const access = (contractingRole: ContractingRole) =>
  createUserAccessSummary({ userId: 'me', equipmentRole: null, contractingRole });

describe('breakdownReadScope', () => {
  test('reads every Breakdown with read, only your own with report alone, and none otherwise', () => {
    expect(breakdownReadScope(access('workshop-manager'))).toBe('all');
    expect(breakdownReadScope(access('foreman'))).toBe('own');
    expect(breakdownReadScope(access('contracting-invoicing'))).toBeNull();
    expect(breakdownReadScope(null)).toBeNull();
  });
});

describe('breakdownFirstLine', () => {
  test('imports the Contracting entrypoint and keeps graphemes intact without Intl.Segmenter', async () => {
    vi.resetModules();
    vi.stubGlobal('Intl', Object.create(Intl, { Segmenter: { value: undefined } }));
    try {
      const contracting = await import('./index.js');
      expect(contracting.breakdownFirstLine('👨‍👩‍👧🇿🇦e\u0301 repair', 4)).toBe('👨‍👩‍👧🇿🇦e\u0301…');
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });

  test('takes the first non-blank line and cuts it with an ellipsis', () => {
    expect(breakdownFirstLine('\n  Brake light out  \nAlso a leak')).toBe('Brake light out');
    expect(breakdownFirstLine('a'.repeat(130), 10)).toBe(`${'a'.repeat(9)}…`);
    expect(breakdownFirstLine('👨‍👩‍👧'.repeat(5), 3)).toBe('👨‍👩‍👧👨‍👩‍👧…');
  });
});

describe('breakdownsByUrgency', () => {
  test('lists Code Red before Code Green, each newest first, without touching the input', () => {
    const greenNew = { urgency: 'code-green' as const, reportedAt: '2026-10-03T08:00:00Z' };
    const redOld = { urgency: 'code-red' as const, reportedAt: '2026-10-01T08:00:00Z' };
    const redNew = { urgency: 'code-red' as const, reportedAt: '2026-10-02T08:00:00Z' };
    const input = [greenNew, redOld, redNew];
    expect(breakdownsByUrgency(input)).toEqual([redNew, redOld, greenNew]);
    expect(input).toEqual([greenNew, redOld, redNew]);
  });
});

describe('mostUrgentBreakdown', () => {
  const at = (urgency: 'code-red' | 'code-green', reportedAt: string) => ({ urgency, reportedAt });

  test('puts Code Red over Code Green however old, and the newest first among equals', () => {
    const oldRed = at('code-red', '2026-10-01T08:00:00Z');
    const newRed = at('code-red', '2026-10-02T08:00:00Z');
    const green = at('code-green', '2026-10-03T08:00:00Z');
    expect(mostUrgentBreakdown([green, oldRed, newRed])).toBe(newRed);
    expect(mostUrgentBreakdown([green, at('code-green', '2026-10-01T08:00:00Z')])).toBe(green);
  });

  test('is none for none', () => {
    expect(mostUrgentBreakdown([])).toBeNull();
  });
});
