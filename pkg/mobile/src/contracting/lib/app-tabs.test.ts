import { createUserAccessSummary } from '@pkg/domain';
import { describe, expect, test } from 'vitest';
import { activeContractingTab, contractingTabBadge, inOwnContractingTab, visibleContractingTabs } from './app-tabs';

const tabsFor = (contractingRole: Parameters<typeof createUserAccessSummary>[0]['contractingRole']) =>
  visibleContractingTabs(createUserAccessSummary({ userId: 'someone', equipmentRole: null, contractingRole }));

describe('Contracting app tabs', () => {
  test('leads with Activity for Job or Breakdown readers, and gives Field Notes to everyone', () => {
    expect(tabsFor('foreman')).toEqual(['activity', 'jobs', 'machines', 'workshop', 'field-notes']);
    expect(tabsFor('workshop-manager')).toEqual(['activity', 'machines', 'workshop', 'services', 'field-notes']);
    expect(tabsFor('contracting-invoicing')).toEqual(['field-notes']);
    expect(tabsFor('driver')).toEqual(['field-notes']);
  });

  test('keeps a record active under the tab it was opened in', () => {
    const at = (...rest: string[]) => activeContractingTab(['(protected)', 'contracting', '(tabs)', ...rest]);
    expect(at('(jobs)', 'jobs', '[jobId]')).toBe('jobs');
    expect(at('(jobs)', 'machines', '[id]', 'capture')).toBe('jobs');
    expect(at('(field-notes)', 'field-notes', '[noteId]')).toBe('field-notes');
    expect(at('(activity)', 'activity')).toBe('activity');
    expect(at('(workshop)', 'jobs', '[jobId]')).toBe('workshop');
    expect(at('(services)', 'services', 'machine', '[machineId]')).toBe('services');
  });

  test('opens a record in its own tab, keeping its query', () => {
    expect(inOwnContractingTab('/contracting/jobs/j1?tab=activity')).toBe('/contracting/(jobs)/jobs/j1?tab=activity');
    expect(inOwnContractingTab('/contracting/workshop/b1')).toBe('/contracting/(workshop)/workshop/b1');
    expect(inOwnContractingTab('/contracting/machines/m1')).toBe('/contracting/(machines)/machines/m1');
    expect(inOwnContractingTab('/contracting/elsewhere')).toBe('/contracting/elsewhere');
  });

  test('dots Field Notes while any is open, and Activity while something is unread', () => {
    const none = { openFieldNotes: false, unreadActivity: false };
    expect(contractingTabBadge('field-notes', { ...none, openFieldNotes: true })).toBe(true);
    expect(contractingTabBadge('field-notes', none)).toBe(false);
    expect(contractingTabBadge('activity', { ...none, unreadActivity: true })).toBe(true);
    expect(contractingTabBadge('jobs', { openFieldNotes: true, unreadActivity: true })).toBe(false);
  });
});
