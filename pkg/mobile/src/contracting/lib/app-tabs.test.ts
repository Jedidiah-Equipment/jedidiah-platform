import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect, test } from 'vitest';
import { activeContractingTab, visibleContractingTabs } from './app-tabs';

describe('Contracting app tabs', () => {
  test('shows Jobs and Machines only when their field permissions are useful', () => {
    expect(
      visibleContractingTabs(
        createUserAccessSummary({ userId: 'foreman', equipmentRole: null, contractingRole: 'foreman' }),
      ),
    ).toEqual(['jobs', 'machines']);
    expect(
      visibleContractingTabs(
        createUserAccessSummary({ userId: 'workshop', equipmentRole: null, contractingRole: 'workshop-manager' }),
      ),
    ).toEqual(['jobs', 'machines']);
    expect(
      visibleContractingTabs(
        createUserAccessSummary({ userId: 'driver', equipmentRole: null, contractingRole: 'driver' }),
      ),
    ).toEqual([]);
  });

  test('keeps detail routes active under their owning tab', () => {
    expect(activeContractingTab(['(protected)', 'contracting', '(tabs)', 'jobs', '[jobId]'])).toBe('jobs');
    expect(activeContractingTab(['(protected)', 'contracting', '(tabs)', 'machines', '[id]', 'capture'])).toBe(
      'machines',
    );
  });
});
