import { hasPermission } from '@pkg/domain';
import type { UserAccessSummary } from '@pkg/schema';
import type { Href } from 'expo-router';

export type ContractingTab = 'jobs' | 'machines';

export function visibleContractingTabs(access: UserAccessSummary | null | undefined): ContractingTab[] {
  const tabs: ContractingTab[] = [];
  if (hasPermission(access, 'contracting_job:read') || hasPermission(access, 'contracting_job:read-own'))
    tabs.push('jobs');
  if (hasPermission(access, 'contracting_machine:read') || hasPermission(access, 'contracting_reading:capture'))
    tabs.push('machines');
  return tabs;
}

export const contractingTabLabel = (tab: ContractingTab) => (tab === 'jobs' ? 'JOBS' : 'MACHINES');
export const contractingTabHref = (tab: ContractingTab): Href =>
  (tab === 'jobs' ? '/contracting/jobs' : '/contracting/machines') as Href;

export function activeContractingTab(segments: readonly string[]): ContractingTab | null {
  const groupIndex = segments.indexOf('(tabs)');
  const segment = groupIndex === -1 ? undefined : segments[groupIndex + 1];
  return segment === 'jobs' || segment === 'machines' ? segment : null;
}
