import type { ScreenCatalog } from '@/lib/screen-catalog';
import { CONTRACTING_TAB_STACK } from './lib/app-tabs';

const TABS = `(protected)/contracting/(tabs)/${CONTRACTING_TAB_STACK}`;

/** Contracting route patterns emitted as non-sensitive mobile `$screen` names. */
export const CONTRACTING_SCREEN_CATALOG = {
  '(protected)/contracting/index.tsx': { business: 'contracting', name: '/contracting' },
  [`${TABS}/jobs/index.tsx`]: {
    business: 'contracting',
    name: '/contracting/jobs',
  },
  [`${TABS}/jobs/new.tsx`]: {
    business: 'contracting',
    name: '/contracting/jobs/new',
  },
  [`${TABS}/jobs/[jobId].tsx`]: {
    business: 'contracting',
    name: '/contracting/jobs/[jobId]',
  },
  [`${TABS}/jobs/[jobId]/add-machine.tsx`]: {
    business: 'contracting',
    name: '/contracting/jobs/[jobId]/add-machine',
  },
  [`${TABS}/jobs/[jobId]/capture.tsx`]: {
    business: 'contracting',
    name: '/contracting/jobs/[jobId]/capture',
  },
  [`${TABS}/machines/index.tsx`]: {
    business: 'contracting',
    name: '/contracting/machines',
  },
  [`${TABS}/machines/[id]/index.tsx`]: {
    business: 'contracting',
    name: '/contracting/machines/[id]',
  },
  [`${TABS}/machines/[id]/capture.tsx`]: {
    business: 'contracting',
    name: '/contracting/machines/[id]/capture',
  },
  [`${TABS}/workshop/index.tsx`]: {
    business: 'contracting',
    name: '/contracting/workshop',
  },
  [`${TABS}/workshop/[breakdownId].tsx`]: {
    business: 'contracting',
    name: '/contracting/workshop/[breakdownId]',
  },
  [`${TABS}/workshop/report.tsx`]: {
    business: 'contracting',
    name: '/contracting/workshop/report',
  },
  [`${TABS}/services/index.tsx`]: {
    business: 'contracting',
    name: '/contracting/services',
  },
  [`${TABS}/services/[serviceId].tsx`]: {
    business: 'contracting',
    name: '/contracting/services/[serviceId]',
  },
  [`${TABS}/services/machine/[machineId].tsx`]: {
    business: 'contracting',
    name: '/contracting/services/machine/[machineId]',
  },
  [`${TABS}/activity/index.tsx`]: {
    business: 'contracting',
    name: '/contracting/activity',
  },
  [`${TABS}/field-notes/index.tsx`]: {
    business: 'contracting',
    name: '/contracting/field-notes',
  },
  [`${TABS}/field-notes/new.tsx`]: {
    business: 'contracting',
    name: '/contracting/field-notes/new',
  },
  [`${TABS}/field-notes/[noteId].tsx`]: {
    business: 'contracting',
    name: '/contracting/field-notes/[noteId]',
  },
} satisfies ScreenCatalog;
