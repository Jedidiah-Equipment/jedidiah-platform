import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect, test } from 'vitest';
import { activeContractingTab, contractingTabBadge, visibleContractingTabs } from './app-tabs';

describe('Contracting app tabs', () => {
  test('shows Jobs and Machines only when their field permissions are useful, and Notes to everyone', () => {
    expect(
      visibleContractingTabs(
        createUserAccessSummary({ userId: 'foreman', equipmentRole: null, contractingRole: 'foreman' }),
      ),
    ).toEqual(['jobs', 'machines', 'workshop', 'notes']);
    expect(
      visibleContractingTabs(
        createUserAccessSummary({ userId: 'workshop', equipmentRole: null, contractingRole: 'workshop-manager' }),
      ),
    ).toEqual(['machines', 'workshop', 'notes']);
    expect(
      visibleContractingTabs(
        createUserAccessSummary({ userId: 'invoicing', equipmentRole: null, contractingRole: 'contracting-invoicing' }),
      ),
    ).toEqual(['notes']);
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
    expect(activeContractingTab(['(protected)', 'contracting', '(tabs)', 'workshop', '[breakdownId]'])).toBe(
      'workshop',
    );
  });

  test('dots Notes while any Field Note is open', () => {
    expect(contractingTabBadge('notes', [{ status: 'closed' }, { status: 'open' }])).toBe(true);
    expect(contractingTabBadge('notes', [{ status: 'closed' }])).toBe(false);
    expect(contractingTabBadge('jobs', [{ status: 'open' }])).toBe(false);
  });
});
