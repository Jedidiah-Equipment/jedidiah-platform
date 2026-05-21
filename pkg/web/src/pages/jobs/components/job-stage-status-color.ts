import type { JobStageName, JobWorkState } from '@pkg/schema';

type JobStageStatusColorClassNames = {
  badge: string;
  icon: string;
};

type JobStageStatusColor = 'blue' | 'emerald' | 'gray';

const jobStageStatusColorClassNames = {
  blue: {
    badge: 'border-blue-500/50 bg-blue-500/15 text-blue-800 dark:text-blue-200',
    icon: 'fill-blue-500 text-blue-500',
  },
  emerald: {
    badge: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
    icon: 'fill-emerald-500 text-emerald-500',
  },
  gray: {
    badge: 'border-gray-400/50 bg-gray-500/10 text-gray-700 dark:text-gray-200',
    icon: 'fill-gray-400 text-gray-400',
  },
} as const satisfies Record<JobStageStatusColor, JobStageStatusColorClassNames>;

// Status colors are intentionally concrete Tailwind classes so the build can see them.
// Pending is gray, in-progress is blue, and complete is green.
export function getJobStageStatusColorClassNames(
  _stage: JobStageName,
  status: JobWorkState,
): JobStageStatusColorClassNames {
  if (status === 'pending') return jobStageStatusColorClassNames.gray;
  if (status === 'complete') return jobStageStatusColorClassNames.emerald;
  return jobStageStatusColorClassNames.blue;
}
