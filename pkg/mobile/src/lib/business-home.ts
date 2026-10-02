import type { Business } from '@pkg/schema';
import type { Href } from 'expo-router';

/** Each business's landing route: the redirect target, the guard fallback, and the switcher destination. */
export const BUSINESS_HOME = {
  contracting: '/contracting',
  equipment: '/equipment',
} as const satisfies Record<Business, Href>;

const FIELD_NOTES = '/contracting/notes';
const isAtOrUnder = (pathname: string, route: string) => pathname === route || pathname.startsWith(`${route}/`);

/** Every route sits behind the offline cover except Field Notes: capture is online only (ADR 0021). */
export function isOfflineCapableRoute(pathname: string): boolean {
  return isAtOrUnder(pathname, FIELD_NOTES);
}

/**
 * The cover's way out on a Contracting route. The root layout has no session to ask, but the Contracting
 * layout redirects anyone without access, so being on a Contracting route is proof enough.
 */
export function offlineCoverAction(pathname: string): { label: string; hint: string; href: Href } | null {
  if (!isAtOrUnder(pathname, BUSINESS_HOME.contracting)) return null;
  return {
    label: 'Open Field Notes',
    hint: 'Keep a Field Note and enter it when you are back online.',
    href: FIELD_NOTES as Href,
  };
}
