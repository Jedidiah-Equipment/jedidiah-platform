import type { Assignment } from '@pkg/schema/contracting';
import { useQuery } from '@tanstack/react-query';
import type { SearchableComboboxOption } from '@/components/common/SearchableCombobox.js';
import { CategoryIcon } from '@/contracting/components/CategoryIcon.js';
import { useTRPC } from '@/lib/trpc.js';

/** The Implement and Driver pick lists for a Machine Assignment, with each surface's own empty choice. */
export function useAssignmentOptions({
  enabled,
  stint = null,
  noImplementLabel,
  noDriverLabel,
}: {
  enabled: boolean;
  /** Its Implement and Driver stay listed even when the pick lists no longer offer them. */
  stint?: Pick<Assignment, 'implementId' | 'implementCode' | 'driverUserId' | 'driverName'> | null;
  noImplementLabel: string;
  noDriverLabel: string;
}) {
  const trpc = useTRPC();
  const implementsQuery = useQuery(trpc.contractingJobs.field.implements.queryOptions(undefined, { enabled }));
  const driversQuery = useQuery(trpc.contractingJobs.field.drivers.queryOptions(undefined, { enabled }));
  const implementOptions: SearchableComboboxOption[] = [
    { value: '', label: noImplementLabel },
    ...(implementsQuery.data ?? []).map((entry) => ({
      value: entry.id,
      label: entry.onSiteJobNumber ? `${entry.code} · On Job ${entry.onSiteJobNumber}` : entry.code,
      icon: <CategoryIcon icon={entry.categoryIcon} colour={entry.categoryColour} size={14} />,
    })),
  ];
  if (stint?.implementId && stint.implementCode && !implementOptions.some((entry) => entry.value === stint.implementId))
    implementOptions.push({ value: stint.implementId, label: stint.implementCode });
  const driverOptions: SearchableComboboxOption[] = [
    { value: '', label: noDriverLabel },
    ...(driversQuery.data ?? []).map((entry) => ({ value: entry.id, label: entry.name })),
  ];
  if (stint?.driverUserId && stint.driverName && !driverOptions.some((entry) => entry.value === stint.driverUserId))
    driverOptions.push({ value: stint.driverUserId, label: stint.driverName });
  return {
    implementOptions,
    driverOptions,
    ready: implementsQuery.isSuccess && driversQuery.isSuccess,
    error: implementsQuery.error ?? driversQuery.error,
  };
}
