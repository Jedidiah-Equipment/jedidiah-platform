import { hasPermission } from '@pkg/domain';
import { canSeeActivity, fieldJobAccessMode } from '@pkg/domain/contracting';
import type { UserAccessSummary } from '@pkg/schema';
import type { Href } from 'expo-router';

export type ContractingTab = 'activity' | 'jobs' | 'machines' | 'workshop' | 'field-notes';

const CONTRACTING_TABS = [
  'activity',
  'jobs',
  'machines',
  'workshop',
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
  tabs.push('field-notes');
  return tabs;
}

export const CONTRACTING_TAB_LABEL = {
  activity: 'ACTIVITY',
  jobs: 'JOBS',
  machines: 'MACHINES',
  workshop: 'WORKSHOP',
  'field-notes': 'FIELD NOTES',
} as const satisfies Record<ContractingTab, string>;

export const CONTRACTING_TAB_HREF = {
  activity: '/contracting/activity' as Href,
  jobs: '/contracting/jobs' as Href,
  machines: '/contracting/machines' as Href,
  workshop: '/contracting/workshop' as Href,
  'field-notes': '/contracting/field-notes' as Href,
} as const satisfies Record<ContractingTab, Href>;

/** What a tab's dot says to a screen reader. */
export const CONTRACTING_TAB_BADGE_LABEL: Partial<Record<ContractingTab, string>> = {
  activity: 'unread activity',
  'field-notes': 'open field notes',
};

export const contractingTabBadge = (
  tab: ContractingTab,
  { openFieldNotes, unreadActivity }: { openFieldNotes: boolean; unreadActivity: boolean },
) => (tab === 'field-notes' && openFieldNotes) || (tab === 'activity' && unreadActivity);

export function activeContractingTab(segments: readonly string[]): ContractingTab | null {
  const groupIndex = segments.indexOf('(tabs)');
  const segment = groupIndex === -1 ? undefined : segments[groupIndex + 1];
  return CONTRACTING_TABS.find((tab) => tab === segment) ?? null;
}
