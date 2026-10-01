import type { Business } from '@pkg/schema';
import type { Href } from 'expo-router';

/** Each business's landing route: the redirect target, the guard fallback, and the switcher destination. */
export const BUSINESS_HOME = {
  contracting: '/contracting',
  equipment: '/equipment',
} as const satisfies Record<Business, Href>;

/** Every route sits behind the offline cover: capture is online only (ADR 0021). */
export function isOfflineCapableRoute(_pathname: string): boolean {
  return false;
}
