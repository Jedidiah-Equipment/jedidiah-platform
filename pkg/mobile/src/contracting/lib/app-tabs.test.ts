import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect, test } from 'vitest';
import { activeContractingTab, contractingTabBadge, visibleContractingTabs } from './app-tabs';

describe('Contracting app tabs', () => {
  test('shows Jobs and Machines only when their field permissions are useful, and Notes to everyone', () => {
    expect(
      visibleContractingTabs(
        createUserAccessSummary({ userId: 'foreman', equipmentRole: null, contractingRole: 'foreman' }),
      ),
    ).toEqual(['jobs', 'machines', 'notes']);
    expect(
      visibleContractingTabs(
        createUserAccessSummary({ userId: 'workshop', equipmentRole: null, contractingRole: 'workshop-manager' }),
      ),
    ).toEqual(['machines', 'notes']);
    expect(
      visibleContractingTabs(
        createUserAccessSummary({ userId: 'driver', equipmentRole: null, contractingRole: 'driver' }),
      ),
    ).toEqual(['notes']);
  });

  test('keeps detail routes active under their owning tab', () => {
    expect(activeContractingTab(['(protected)', 'contracting', '(tabs)', 'jobs', '[jobId]'])).toBe('jobs');
    expect(activeContractingTab(['(protected)', 'contracting', '(tabs)', 'machines', '[id]', 'capture'])).toBe(
      'machines',
    );
    expect(activeContractingTab(['(protected)', 'contracting', '(tabs)', 'notes', '[noteId]'])).toBe('notes');
  });

  test('dots Notes while any Field Note is open', () => {
    expect(contractingTabBadge('notes', [{ status: 'closed' }, { status: 'open' }])).toBe(true);
    expect(contractingTabBadge('notes', [{ status: 'closed' }])).toBe(false);
    expect(contractingTabBadge('jobs', [{ status: 'open' }])).toBe(false);
  });
});
