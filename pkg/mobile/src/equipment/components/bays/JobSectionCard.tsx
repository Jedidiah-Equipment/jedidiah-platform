import type { JobDetail } from '@pkg/schema/equipment';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';

import { CardCollapse } from '@/components/ui/card-collapse';
import { Text } from '@/components/ui/text';
import { useTRPC } from '@/lib/trpc';

/**
 * Shared shell for the Job detail cards that read from the cached `jobs.get` query — the DOCUMENTS
 * list (#521) and the ASSEMBLIES list. Both collapse behind their heading, so a long list never
 * buries the cards under it. Owns the `TITLE · N` heading and the loading / error / empty ladder,
 * so each card only supplies its data slice and row renderer.
 */
export function JobSectionCard<T>({
  jobId,
  title,
  noun,
  select,
  renderItem,
}: {
  jobId: string;
  /** Uppercase card heading, e.g. `ASSEMBLIES`. */
  title: string;
  /** Lowercase plural used in the loading/error/empty copy, e.g. `assemblies`. */
  noun: string;
  select: (data: JobDetail) => readonly T[];
  renderItem: (item: T) => ReactNode;
}) {
  const trpc = useTRPC();
  const query = useQuery(trpc.jobs.get.queryOptions({ id: jobId }));
  const items = query.data ? select(query.data) : [];
  const heading = query.isSuccess ? `${title} · ${items.length}` : title;

  const body = query.isPending ? (
    <Text className="py-2 text-sm text-muted-foreground">Loading {noun}…</Text>
  ) : query.isError ? (
    <Text className="py-2 text-sm text-danger">Couldn’t load {noun}.</Text>
  ) : items.length === 0 ? (
    <Text className="py-2 text-sm text-muted-foreground">No {noun} for this job.</Text>
  ) : (
    items.map(renderItem)
  );

  return <CardCollapse title={heading}>{body}</CardCollapse>;
}
