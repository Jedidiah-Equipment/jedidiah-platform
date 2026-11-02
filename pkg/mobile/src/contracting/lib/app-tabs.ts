import { hasPermission } from '@pkg/domain';
import { canSeeActivity, fieldJobAccessMode } from '@pkg/domain/contracting';
import type { UserAccessSummary } from '@pkg/schema';
import type { Href } from 'expo-router';

export type ContractingTab = 'activity' | 'jobs' | 'machines' | 'workshop' | 'services' | 'field-notes';

export const CONTRACTING_TABS = [
  'activity',
  'jobs',
  'machines',
  'workshop',
  'services',
  'field-notes',
] as const satisfies readonly ContractingTab[];

/** Activity leads for anyone who reads Jobs or Breakdowns; Field Notes is everyone's, needing no permission. */
export function visibleContractingTabs(access: UserAccessSummary | null | undefined): ContractingTab[] {
  const tabs: ContractingTab[] = [];
  if (canSeeActivity(access)) tabs.push('activity');
  if (fieldJobAccessMode(access)) tabs.push('jobs');
  if (hasPermission(access, 'contracting_machine:read') || hasPermission(access, 'contracting_reading:capture'))
    tabs.push('machines');
  if (hasPermission(access, 'contracting_breakdown:read') || hasPermission(access, 'contracting_breakdown:report'))
    tabs.push('workshop');
  if (hasPermission(access, 'contracting_service:read')) tabs.push('services');
  tabs.push('field-notes');
  return tabs;
}

export const CONTRACTING_TAB_LABEL = {
  activity: 'ACTIVITY',
  jobs: 'JOBS',
  machines: 'MACHINES',
  workshop: 'WORKSHOP',
  services: 'SERVICES',
  'field-notes': 'FIELD NOTES',
} as const satisfies Record<ContractingTab, string>;

/**
 * The folder every tab's stack is a copy of: each tab is a group named for itself, `(jobs)`, holding every Contracting
 * screen, so a record opened from another stays in the tab you are in.
 */
export const CONTRACTING_TAB_STACK = '(activity,field-notes,jobs,machines,services,workshop)';

/** A tab's list as the router reports its pathname, which never names the group. */
export const contractingTabPath = (tab: ContractingTab) => `/contracting/${tab}`;

/**
 * A Contracting path opened in its record's own tab, as a tapped push opens it: `/contracting/jobs/j1` in Jobs. A bare
 * path opens in whichever tab you are in, and a cold start has none.
 */
export function inOwnContractingTab(path: string): string {
  const match = /^\/contracting\/([a-z-]+)(.*)$/.exec(path);
  const tab = CONTRACTING_TABS.find((candidate) => candidate === match?.[1]);
  return tab ? `/contracting/(${tab})/${tab}${match?.[2] ?? ''}` : path;
}

/** Each tab's list, opened in its own tab. */
export const CONTRACTING_TAB_HREF = Object.fromEntries(
  CONTRACTING_TABS.map((tab) => [tab, inOwnContractingTab(contractingTabPath(tab)) as Href]),
) as Record<ContractingTab, Href>;

/** What a tab's dot says to a screen reader. */
export const CONTRACTING_TAB_BADGE_LABEL: Partial<Record<ContractingTab, string>> = {
  activity: 'unread activity',
  'field-notes': 'open field notes',
};

export const contractingTabBadge = (
  tab: ContractingTab,
  { openFieldNotes, unreadActivity }: { openFieldNotes: boolean; unreadActivity: boolean },
) => (tab === 'field-notes' && openFieldNotes) || (tab === 'activity' && unreadActivity);

/** The tab you are in, from its stack's `(tab)` group: a Machine opened from a Job is still in Jobs. */
export function activeContractingTab(segments: readonly string[]): ContractingTab | null {
  const groupIndex = segments.indexOf('(tabs)');
  const segment = groupIndex === -1 ? undefined : segments[groupIndex + 1];
  return CONTRACTING_TABS.find((tab) => `(${tab})` === segment) ?? null;
}
