import { describe, expect, it } from 'vitest';
import { implementPatchInput, machinePatchInput, serviceFilterMatches } from './types.js';

const id = '00000000-0000-4000-8000-000000000001';
describe('fleet form mappers', () => {
  it('sends empty machine controls as null', () => {
    const values = {
      code: 'JD6140M-1',
      make: 'Deere',
      model: '6140M',
      categoryId: id,
      currentDriverUserId: '',
      year: NaN,
      registration: '',
      notes: '',
      serviceIntervalHours: NaN,
      nextServiceDueHours: NaN,
    };
    expect(machinePatchInput(id, values)).toMatchObject({
      currentDriverUserId: null,
      year: null,
      registration: null,
      notes: null,
      serviceIntervalHours: null,
      nextServiceDueHours: null,
    });
  });
  it('sends empty implement notes as null', () => {
    expect(implementPatchInput(id, { code: 'DISC-1', categoryId: id, notes: '' })).toMatchObject({ notes: null });
  });
});

describe('serviceFilterMatches', () => {
  it('reads Needs attention as due soon or overdue, and the other picks as their own status', () => {
    expect(serviceFilterMatches('due-soon', 'attention')).toBe(true);
    expect(serviceFilterMatches('overdue', 'attention')).toBe(true);
    expect(serviceFilterMatches('ok', 'attention')).toBe(false);
    expect(serviceFilterMatches('unknown', 'attention')).toBe(false);
    expect(serviceFilterMatches('ok', 'ok')).toBe(true);
    expect(serviceFilterMatches('overdue', 'ok')).toBe(false);
    expect(serviceFilterMatches('unknown', 'unknown')).toBe(true);
  });
});
