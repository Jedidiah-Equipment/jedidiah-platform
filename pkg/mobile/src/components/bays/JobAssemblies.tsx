import { View } from 'react-native';
import { JobSectionCard } from '@/components/bays/JobSectionCard';
import { getJobAssemblyAndWorkRows, type JobAssemblyAndWorkRow } from '@/components/bays/job-assembly-and-work-rows';
import { STATUS_TONE } from '@/components/bays/status-chip';
import { Text } from '@/components/ui/text';

/** Pill accents per row kind; `standard` reuses the shared muted status tone. */
const OPTIONAL_TONE = { chip: 'border-primary/30 bg-primary/10', dot: 'bg-primary', text: 'text-primary' };

function kindTone(kind: JobAssemblyAndWorkRow['kind']) {
  if (kind === 'custom') return STATUS_TONE.next;
  return kind === 'optional' ? OPTIONAL_TONE : STATUS_TONE.muted;
}

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
  const tone = kindTone(row.kind);

  return (
    <View className="flex-row items-center gap-2 border-t border-border py-3">
      <View className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      <Text className="flex-1 text-sm text-surface-foreground" numberOfLines={1} weight="semibold">
        {row.name}
      </Text>
      <View className={`rounded-full border px-2.5 py-1 ${tone.chip}`}>
        <Text className={`text-[10px] tracking-wide ${tone.text}`} weight="semibold">
          {row.kind.toUpperCase()}
        </Text>
      </View>
    </View>
  );
}
