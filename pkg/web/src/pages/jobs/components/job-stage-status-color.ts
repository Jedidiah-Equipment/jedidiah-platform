import { JOB_STAGE_STATUSES, type JobStageName, type JobStageStatus } from '@pkg/schema';

type JobStageStatusColorClassNames = {
  badge: string;
  icon: string;
};

type JobStageStatusColor = 'orange' | 'emerald' | 'gray' | 'purple' | 'blue' | 'red';

const inBetweenColors = ['orange', 'purple', 'blue'] as const satisfies readonly JobStageStatusColor[];

const jobStageStatusColorClassNames = {
  orange: {
    badge: 'border-orange-500/50 bg-orange-500/15 text-orange-800 dark:text-orange-200',
    icon: 'fill-orange-500 text-orange-500',
  },
  emerald: {
    badge: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
    icon: 'fill-emerald-500 text-emerald-500',
  },
  gray: {
    badge: 'border-gray-400/50 bg-gray-500/10 text-gray-700 dark:text-gray-200',
    icon: 'fill-gray-400 text-gray-400',
  },
  purple: {
    badge: 'border-purple-500/50 bg-purple-500/15 text-purple-800 dark:text-purple-200',
    icon: 'fill-purple-500 text-purple-500',
  },
  blue: {
    badge: 'border-blue-500/50 bg-blue-500/15 text-blue-800 dark:text-blue-200',
    icon: 'fill-blue-500 text-blue-500',
  },
  red: {
    badge: 'border-red-500/50 bg-red-500/15 text-red-800 dark:text-red-200',
    icon: 'fill-red-500 text-red-500',
  },
} as const satisfies Record<JobStageStatusColor, JobStageStatusColorClassNames>;

// Status colors are intentionally concrete Tailwind classes so the build can see them.
// Pending is gray, complete is green, and in-between workflow statuses progress amber -> teal -> indigo.
export function getJobStageStatusColorClassNames(
  stage: JobStageName,
  status: JobStageStatus,
): JobStageStatusColorClassNames {
  if (status === 'pending') return jobStageStatusColorClassNames.gray;
  if (status === 'complete') return jobStageStatusColorClassNames.emerald;

  const inBetweenIndex = JOB_STAGE_STATUSES[stage]
    .filter((stageStatus) => {
      return stageStatus !== 'pending' && stageStatus !== 'complete';
    })
    .indexOf(status);

  // Red is a fallback for in-between statuses that don't have a color. We should add more colors to the inBetweenColors array if we need more.
  const color = inBetweenColors[Math.max(0, Math.min(inBetweenIndex, inBetweenColors.length - 1))] ?? 'red';

  return jobStageStatusColorClassNames[color];
}
