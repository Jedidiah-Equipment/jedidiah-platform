import type { Business } from '@pkg/schema';

export type MobileScreen = { business: Business | null; name: string };

/** The reviewed, non-sensitive route patterns emitted as mobile `$screen` names. */
export const MOBILE_SCREEN_CATALOG: Record<string, MobileScreen> = {
  'forgot-password.tsx': { business: null, name: '/forgot-password' },
  'login.tsx': { business: null, name: '/login' },
  '(protected)/index.tsx': { business: null, name: '/' },
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
  '(protected)/equipment/(tabs)/index.tsx': { business: 'equipment', name: '/equipment' },
  '(protected)/equipment/(tabs)/(plan)/plan/index.tsx': { business: 'equipment', name: '/equipment/plan' },
  '(protected)/equipment/(tabs)/(plan)/bays/[bayId].tsx': {
    business: 'equipment',
    name: '/equipment/bays/[bayId]',
  },
  '(protected)/equipment/(tabs)/activity/index.tsx': { business: 'equipment', name: '/equipment/activity' },
  '(protected)/equipment/(tabs)/jobs/index.tsx': { business: 'equipment', name: '/equipment/jobs' },
  '(protected)/equipment/(tabs)/jobs/[jobId].tsx': { business: 'equipment', name: '/equipment/jobs/[jobId]' },
  '(protected)/equipment/(tabs)/products/index.tsx': { business: 'equipment', name: '/equipment/products' },
  '(protected)/equipment/(tabs)/products/[productId].tsx': {
    business: 'equipment',
    name: '/equipment/products/[productId]',
  },
  '(protected)/equipment/(tabs)/quotes/index.tsx': { business: 'equipment', name: '/equipment/quotes' },
  '(protected)/equipment/(tabs)/quotes/[quoteId].tsx': {
    business: 'equipment',
    name: '/equipment/quotes/[quoteId]',
  },
  '(protected)/equipment/(tabs)/units/index.tsx': { business: 'equipment', name: '/equipment/units' },
  '(protected)/equipment/(tabs)/units/[unitId].tsx': { business: 'equipment', name: '/equipment/units/[unitId]' },
  '(protected)/equipment/(tabs)/stores/index.tsx': { business: 'equipment', name: '/equipment/stores' },
  '(protected)/equipment/(tabs)/stores/close-out/index.tsx': {
    business: 'equipment',
    name: '/equipment/stores/close-out',
  },
  '(protected)/equipment/(tabs)/stores/close-out/[jobId].tsx': {
    business: 'equipment',
    name: '/equipment/stores/close-out/[jobId]',
  },
  '(protected)/equipment/(tabs)/stores/parts/[partCode]/index.tsx': {
    business: 'equipment',
    name: '/equipment/stores/parts/[partCode]',
  },
  '(protected)/equipment/(tabs)/stores/parts/[partCode]/checkout.tsx': {
    business: 'equipment',
    name: '/equipment/stores/parts/[partCode]/checkout',
  },
  '(protected)/equipment/(tabs)/stores/parts/[partCode]/receive.tsx': {
    business: 'equipment',
    name: '/equipment/stores/parts/[partCode]/receive',
  },
  '(protected)/equipment/(tabs)/stores/parts/[partCode]/return-to-store.tsx': {
    business: 'equipment',
    name: '/equipment/stores/parts/[partCode]/return-to-store',
  },
  '(protected)/equipment/(tabs)/stores/parts/[partCode]/return-to-supplier.tsx': {
    business: 'equipment',
    name: '/equipment/stores/parts/[partCode]/return-to-supplier',
  },
  '(protected)/equipment/(tabs)/stores/stocktake/index.tsx': {
    business: 'equipment',
    name: '/equipment/stores/stocktake',
  },
  '(protected)/equipment/(tabs)/stores/stocktake/[sessionId].tsx': {
    business: 'equipment',
    name: '/equipment/stores/stocktake/[sessionId]',
  },
  '(protected)/equipment/assistant.tsx': { business: 'equipment', name: '/equipment/assistant' },
  '(protected)/equipment/documents/[documentId].tsx': {
    business: 'equipment',
    name: '/equipment/documents/[documentId]',
  },
};

const SCREEN_BY_SEGMENTS = new Map(
  Object.entries(MOBILE_SCREEN_CATALOG).map(([file, screen]) => [file.replace(/\.tsx$/, ''), screen]),
);

export function screenForSegments(segments: readonly string[]): MobileScreen | null {
  const key = segments.join('/');
  return SCREEN_BY_SEGMENTS.get(key) ?? SCREEN_BY_SEGMENTS.get(`${key}/index`) ?? null;
}
