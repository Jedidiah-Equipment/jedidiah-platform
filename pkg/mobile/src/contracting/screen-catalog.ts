import type { ScreenCatalog } from '@/lib/screen-catalog';

/** Contracting route patterns emitted as non-sensitive mobile `$screen` names. */
export const CONTRACTING_SCREEN_CATALOG = {
  '(protected)/contracting/index.tsx': { business: 'contracting', name: '/contracting' },
  '(protected)/contracting/attention.tsx': { business: 'contracting', name: '/contracting/attention' },
  '(protected)/contracting/(tabs)/jobs/index.tsx': { business: 'contracting', name: '/contracting/jobs' },
  '(protected)/contracting/(tabs)/jobs/[jobId].tsx': {
    business: 'contracting',
    name: '/contracting/jobs/[jobId]',
  },
  '(protected)/contracting/(tabs)/jobs/[jobId]/add-machine.tsx': {
    business: 'contracting',
    name: '/contracting/jobs/[jobId]/add-machine',
  },
  '(protected)/contracting/(tabs)/machines/index.tsx': { business: 'contracting', name: '/contracting/machines' },
  '(protected)/contracting/(tabs)/machines/[id]/index.tsx': {
    business: 'contracting',
    name: '/contracting/machines/[id]',
  },
  '(protected)/contracting/(tabs)/machines/[id]/capture.tsx': {
    business: 'contracting',
    name: '/contracting/machines/[id]/capture',
  },
} satisfies ScreenCatalog;
