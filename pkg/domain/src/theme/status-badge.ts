/** Shared semantic badge palette used across web and mobile surfaces. */
export const statusBadgeColorClassNames = {
  blue: { chip: 'border-blue-500/50 bg-blue-500/15', dot: 'bg-blue-500', text: 'text-blue-800 dark:text-blue-200' },
  gray: { chip: 'border-gray-400/50 bg-gray-500/10', dot: 'bg-gray-500', text: 'text-gray-700 dark:text-gray-200' },
  green: {
    chip: 'border-emerald-500/50 bg-emerald-500/15',
    dot: 'bg-emerald-500',
    text: 'text-emerald-800 dark:text-emerald-200',
  },
  orange: {
    chip: 'border-orange-500/50 bg-orange-500/15',
    dot: 'bg-orange-500',
    text: 'text-orange-800 dark:text-orange-200',
  },
  purple: {
    chip: 'border-purple-500/50 bg-purple-500/15',
    dot: 'bg-purple-500',
    text: 'text-purple-800 dark:text-purple-200',
  },
  red: { chip: 'border-red-500/50 bg-red-500/15', dot: 'bg-red-500', text: 'text-red-800 dark:text-red-200' },
  teal: { chip: 'border-teal-500/50 bg-teal-500/15', dot: 'bg-teal-500', text: 'text-teal-800 dark:text-teal-200' },
  yellow: {
    chip: 'border-yellow-500/50 bg-yellow-500/15',
    dot: 'bg-yellow-500',
    text: 'text-yellow-800 dark:text-yellow-200',
  },
} as const;

export type StatusBadgeColor = keyof typeof statusBadgeColorClassNames;

/**
 * Cancelled reads the same wherever it appears: a cancelled Quote and a cancelled Job are one fact
 * about different rows, so both chips point here rather than picking a colour each.
 */
export const cancelledBadgeColorClassNames = statusBadgeColorClassNames.orange;
