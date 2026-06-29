import type { JobDetail } from '@pkg/schema';
import { View } from 'react-native';

import { JobSectionCard } from '@/components/bays/JobSectionCard';
import { STATUS_TONE } from '@/components/bays/status-chip';
import { Text } from '@/components/ui/text';

type JobAssembly = JobDetail['cfo'][number];

/** Pill accents per assembly kind; `standard` reuses the shared muted status tone. */
const OPTIONAL_TONE = { chip: 'border-primary/30 bg-primary/10', dot: 'bg-primary', text: 'text-primary' };

function kindTone(kind: JobAssembly['kind']) {
  return kind === 'optional' ? OPTIONAL_TONE : STATUS_TONE.muted;
}

/**
 * The ASSEMBLIES card shared by the Job Slot detail pane (#520) and Job Detail (#615): the job's
 * configured assemblies from the cached `jobs.get` `cfo` snapshot. That snapshot already holds only
 * the optional assemblies selected for this job (never the full catalog); optionals are shown first.
 */
export function JobAssemblies({ jobId }: { jobId: string }) {
  return (
    <JobSectionCard<JobAssembly>
      jobId={jobId}
      noun="assemblies"
      renderItem={(assembly) => <AssemblyRow assembly={assembly} key={`${assembly.kind}-${assembly.assemblyName}`} />}
      select={(data) => [...data.cfo].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'optional' ? -1 : 1))}
      title="ASSEMBLIES"
    />
  );
}

function AssemblyRow({ assembly }: { assembly: JobAssembly }) {
  const tone = kindTone(assembly.kind);

  return (
    <View className="flex-row items-center gap-2 border-t border-border py-3">
      <View className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      <Text className="flex-1 text-sm text-surface-foreground" numberOfLines={1} weight="semibold">
        {assembly.assemblyName}
      </Text>
      <View className={`rounded-full border px-2.5 py-1 ${tone.chip}`}>
        <Text className={`text-[10px] tracking-wide ${tone.text}`} weight="semibold">
          {assembly.kind === 'optional' ? 'OPTIONAL' : 'STANDARD'}
        </Text>
      </View>
    </View>
  );
}
