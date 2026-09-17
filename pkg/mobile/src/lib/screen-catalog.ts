import type { Business } from '@pkg/schema';

export type MobileScreen = { business: Business | null; name: string };
export type ScreenCatalog = Record<string, MobileScreen>;

/** The reviewed, non-sensitive shared route patterns emitted as mobile `$screen` names. */
export const SHARED_SCREEN_CATALOG: ScreenCatalog = {
  'forgot-password.tsx': { business: null, name: '/forgot-password' },
  'login.tsx': { business: null, name: '/login' },
  '(protected)/index.tsx': { business: null, name: '/' },
};

export function createScreenResolver(catalogs: readonly ScreenCatalog[]) {
  const screensBySegments = new Map(
    catalogs.flatMap((catalog) =>
      Object.entries(catalog).map(([file, screen]) => [file.replace(/\.tsx$/, ''), screen] as const),
    ),
  );
  return (segments: readonly string[]): MobileScreen | null => {
    const key = segments.join('/');
    return screensBySegments.get(key) ?? screensBySegments.get(`${key}/index`) ?? null;
  };
}
