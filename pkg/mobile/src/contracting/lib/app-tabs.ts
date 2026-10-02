import { hasPermission } from '@pkg/domain';
import { fieldJobAccessMode } from '@pkg/domain/contracting';
import type { UserAccessSummary } from '@pkg/schema';
import type { Href } from 'expo-router';

export type ContractingTab = 'jobs' | 'machines' | 'notes';

/** Notes is every Contracting user's: a Field Note needs no permission and never leaves the phone. */
export function visibleContractingTabs(access: UserAccessSummary | null | undefined): ContractingTab[] {
  const tabs: ContractingTab[] = [];
  if (fieldJobAccessMode(access)) tabs.push('jobs');
  if (hasPermission(access, 'contracting_machine:read') || hasPermission(access, 'contracting_reading:capture'))
    tabs.push('machines');
  tabs.push('notes');
  return tabs;
}

export const CONTRACTING_TAB_LABEL = {
  jobs: 'JOBS',
  machines: 'MACHINES',
  notes: 'NOTES',
} as const satisfies Record<ContractingTab, string>;

export const CONTRACTING_TAB_HREF = {
  jobs: '/contracting/jobs' as Href,
  machines: '/contracting/machines' as Href,
  notes: '/contracting/notes' as Href,
} as const satisfies Record<ContractingTab, Href>;

/** The orange dot: Notes while any Field Note is still Open. */
export const contractingTabBadge = (tab: ContractingTab, notes: readonly { status: 'open' | 'closed' }[]) =>
  tab === 'notes' && notes.some((note) => note.status === 'open');

export function activeContractingTab(segments: readonly string[]): ContractingTab | null {
  const groupIndex = segments.indexOf('(tabs)');
  const segment = groupIndex === -1 ? undefined : segments[groupIndex + 1];
  return segment === 'jobs' || segment === 'machines' || segment === 'notes' ? segment : null;
}
