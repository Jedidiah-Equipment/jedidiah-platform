import { statusBadgeColorClassNames } from '@pkg/domain';
import { quoteKindColorClassNames, quoteKindLabels } from '@pkg/domain/equipment';
import { View } from 'react-native';
import { StatusBadge, type StatusBadgeClassNames } from '@/components/ui/status-badge';
import { Text } from '@/components/ui/text';
import { JobSectionCard } from '@/equipment/components/bays/JobSectionCard';
import {
  getJobAssemblyAndWorkRows,
  type JobAssemblyAndWorkRow,
} from '@/equipment/components/bays/job-assembly-and-work-rows';

const KIND_TONES = {
  custom: { ...quoteKindColorClassNames.custom, dot: statusBadgeColorClassNames.teal.dot },
  optional: statusBadgeColorClassNames.yellow,
  standard: statusBadgeColorClassNames.gray,
} as const satisfies Record<JobAssemblyAndWorkRow['kind'], StatusBadgeClassNames & { dot: string }>;

const KIND_LABELS: Record<JobAssemblyAndWorkRow['kind'], string> = {
  custom: quoteKindLabels.custom,
  optional: 'Optional',
  standard: 'Standard',
};

/**
 * The ASSEMBLIES card shared by Job Slot detail and Job Detail. Job Work Items lead the
 * job's frozen configured assemblies; the CFO contains only the selected optionals, not the catalog.
 */
export function JobAssemblies({ jobId }: { jobId: string }) {
  return (
    <JobSectionCard<JobAssemblyAndWorkRow>
      jobId={jobId}
      noun="assemblies"
      renderItem={(row) => <AssemblyAndWorkItemRow key={row.key} row={row} />}
      select={getJobAssemblyAndWorkRows}
      title="ASSEMBLIES"
    />
  );
}

function AssemblyAndWorkItemRow({ row }: { row: JobAssemblyAndWorkRow }) {
  const tone = KIND_TONES[row.kind];

  return (
    <View className="flex-row items-center gap-2 border-t border-border py-3">
      <View className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      <Text className="flex-1 text-sm text-surface-foreground" numberOfLines={1} weight="semibold">
        {row.name}
      </Text>
      <StatusBadge classNames={tone} label={KIND_LABELS[row.kind]} />
    </View>
  );
}
