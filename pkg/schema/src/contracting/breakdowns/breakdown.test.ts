import { describe, expect, it } from 'vitest';
import { BreakdownListInput } from './breakdown.js';

describe('BreakdownListInput', () => {
  it('folds the singular subject an older mobile build sends into the subject lists', () => {
    const machineId = '00000000-0000-4000-8000-000000000001';
    const implementId = '00000000-0000-4000-8000-000000000002';
    const parsed = BreakdownListInput.parse({ machineId, implementId, machineIds: [implementId] });
    expect(parsed).toMatchObject({ machineIds: [implementId, machineId], implementIds: [implementId] });
    expect(parsed).not.toHaveProperty('machineId');
    expect(BreakdownListInput.parse({})).toMatchObject({ machineIds: [], implementIds: [] });
  });
});
