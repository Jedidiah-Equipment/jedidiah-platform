import type { Business } from '@pkg/schema';
import type { Href } from 'expo-router';

/** Each business's landing route: the redirect target, the guard fallback, and the switcher destination. */
export const BUSINESS_HOME = {
  contracting: '/contracting',
  equipment: '/equipment',
} as const satisfies Record<Business, Href>;

/** Businesses whose field routes keep working while disconnected. */
const OFFLINE_CAPABLE_BUSINESSES: readonly Business[] = ['contracting'];

export function isOfflineCapableRoute(pathname: string): boolean {
  return OFFLINE_CAPABLE_BUSINESSES.some((business) => {
    const home = BUSINESS_HOME[business];
    return pathname === home || pathname.startsWith(`${home}/`);
  });
}
