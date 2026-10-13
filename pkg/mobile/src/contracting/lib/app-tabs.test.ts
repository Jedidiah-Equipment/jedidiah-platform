import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect, test } from 'vitest';
import { activeContractingTab, contractingTabBadge, visibleContractingTabs } from './app-tabs';

const tabsFor = (contractingRole: Parameters<typeof createUserAccessSummary>[0]['contractingRole']) =>
  visibleContractingTabs(createUserAccessSummary({ userId: 'someone', equipmentRole: null, contractingRole }));

describe('Contracting app tabs', () => {
  test('leads with Activity for Job or Breakdown readers, and gives Field Notes to everyone', () => {
    expect(tabsFor('foreman')).toEqual(['activity', 'jobs', 'machines', 'workshop', 'field-notes']);
    expect(tabsFor('workshop-manager')).toEqual(['activity', 'machines', 'workshop', 'field-notes']);
    expect(tabsFor('contracting-invoicing')).toEqual(['field-notes']);
    expect(tabsFor('driver')).toEqual(['field-notes']);
  });

  test('keeps detail routes active under their owning tab', () => {
    expect(activeContractingTab(['(protected)', 'contracting', '(tabs)', 'jobs', '[jobId]'])).toBe('jobs');
    expect(activeContractingTab(['(protected)', 'contracting', '(tabs)', 'machines', '[id]', 'capture'])).toBe(
      'machines',
    );
    expect(activeContractingTab(['(protected)', 'contracting', '(tabs)', 'field-notes', '[noteId]'])).toBe(
      'field-notes',
    );
    expect(activeContractingTab(['(protected)', 'contracting', '(tabs)', 'activity'])).toBe('activity');
    expect(activeContractingTab(['(protected)', 'contracting', '(tabs)', 'workshop', '[breakdownId]'])).toBe(
      'workshop',
    );
  });

  test('dots Field Notes while any is open, and Activity while something is unread', () => {
    const none = { openFieldNotes: false, unreadActivity: false };
    expect(contractingTabBadge('field-notes', { ...none, openFieldNotes: true })).toBe(true);
    expect(contractingTabBadge('field-notes', none)).toBe(false);
    expect(contractingTabBadge('activity', { ...none, unreadActivity: true })).toBe(true);
    expect(contractingTabBadge('jobs', { openFieldNotes: true, unreadActivity: true })).toBe(false);
  });
});
