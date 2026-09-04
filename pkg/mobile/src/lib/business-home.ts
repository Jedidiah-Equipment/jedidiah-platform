import type { Business } from '@pkg/domain';
import type { Href } from 'expo-router';

/** Each business's landing route: the redirect target, the guard fallback, and the switcher destination. */
export const BUSINESS_HOME = {
  contracting: '/contracting',
  equipment: '/equipment',
} as const satisfies Record<Business, Href>;
