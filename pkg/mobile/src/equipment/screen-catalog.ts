import type { ScreenCatalog } from '@/lib/screen-catalog';

/** Equipment route patterns emitted as non-sensitive mobile `$screen` names. */
export const EQUIPMENT_SCREEN_CATALOG = {
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
} satisfies ScreenCatalog;
