import { describe, expect, it } from 'vitest';
import { actionSheet, presentAction } from './action-verdicts.js';

const allowed = { allowed: true } as const;
const noPermission = { allowed: false, reason: 'no-permission', message: 'You do not have permission.' } as const;
const wrongStatus = { allowed: false, reason: 'wrong-status', message: 'Only while Open.' } as const;

describe('presentAction', () => {
  it('renders nothing for someone who never holds the action', () => {
    expect(presentAction(noPermission)).toBeNull();
  });
  it('shows an allowed action enabled with no title', () => {
    expect(presentAction(allowed)).toEqual({ disabled: false, title: undefined });
  });
  it('shows a refused action disabled with the refusal', () => {
    expect(presentAction(wrongStatus)).toEqual({ disabled: true, title: 'Only while Open.' });
  });
});

describe('actionSheet', () => {
  const sheet = actionSheet({ start: allowed, solve: wrongStatus, assign: noPermission });
  it('reads each verdict', () => {
    expect(sheet.can('start')).toBe(true);
    expect(sheet.can('solve')).toBe(false);
    expect(sheet.holds('solve')).toBe(true);
    expect(sheet.holds('assign')).toBe(false);
    expect(sheet.refusal('solve')).toBe('Only while Open.');
    expect(sheet.refusal('start')).toBeUndefined();
    expect(sheet.action('assign')).toBeNull();
  });
});
