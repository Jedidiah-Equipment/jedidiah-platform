import type { ScreenCatalog } from '@/lib/screen-catalog';

/** Contracting route patterns emitted as non-sensitive mobile `$screen` names. */
export const CONTRACTING_SCREEN_CATALOG = {
  '(protected)/contracting/index.tsx': { business: 'contracting', name: '/contracting' },
  '(protected)/contracting/(tabs)/jobs/index.tsx': { business: 'contracting', name: '/contracting/jobs' },
  '(protected)/contracting/(tabs)/jobs/[jobId].tsx': {
    business: 'contracting',
    name: '/contracting/jobs/[jobId]',
  },
  '(protected)/contracting/(tabs)/jobs/[jobId]/add-machine.tsx': {
    business: 'contracting',
    name: '/contracting/jobs/[jobId]/add-machine',
  },
  '(protected)/contracting/(tabs)/jobs/[jobId]/capture.tsx': {
    business: 'contracting',
    name: '/contracting/jobs/[jobId]/capture',
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
  '(protected)/contracting/(tabs)/workshop/index.tsx': { business: 'contracting', name: '/contracting/workshop' },
  '(protected)/contracting/(tabs)/workshop/[breakdownId].tsx': {
    business: 'contracting',
    name: '/contracting/workshop/[breakdownId]',
  },
  '(protected)/contracting/(tabs)/workshop/report.tsx': {
    business: 'contracting',
    name: '/contracting/workshop/report',
  },
  '(protected)/contracting/(tabs)/notes/index.tsx': { business: 'contracting', name: '/contracting/notes' },
  '(protected)/contracting/(tabs)/notes/new.tsx': { business: 'contracting', name: '/contracting/notes/new' },
  '(protected)/contracting/(tabs)/notes/[noteId].tsx': {
    business: 'contracting',
    name: '/contracting/notes/[noteId]',
  },
} satisfies ScreenCatalog;
