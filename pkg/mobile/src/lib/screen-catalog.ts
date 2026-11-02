import type { Business } from '@pkg/schema';

export type MobileScreen = { business: Business | null; name: string };
export type ScreenCatalog = Record<string, MobileScreen>;

/** The reviewed, non-sensitive shared route patterns emitted as mobile `$screen` names. */
export const SHARED_SCREEN_CATALOG: ScreenCatalog = {
  'forgot-password.tsx': { business: null, name: '/forgot-password' },
  'login.tsx': { business: null, name: '/login' },
  '(protected)/index.tsx': { business: null, name: '/' },
  '(protected)/settings.tsx': { business: null, name: '/settings' },
};

/** A file under a shared group, `(a,b)/x`, is a route in each group: `(a)/x` and `(b)/x`. */
function routeSegments(file: string): string[] {
  let routes = [''];
  for (const segment of file.replace(/\.tsx$/, '').split('/')) {
    const groups = /^\((.+,.+)\)$/.exec(segment)?.[1]?.split(',');
    const parts = groups ? groups.map((group) => `(${group})`) : [segment];
    routes = routes.flatMap((route) => parts.map((part) => (route ? `${route}/${part}` : part)));
  }
  return routes;
}

export function createScreenResolver(catalogs: readonly ScreenCatalog[]) {
  const screensBySegments = new Map(
    catalogs.flatMap((catalog) =>
      Object.entries(catalog).flatMap(([file, screen]) => routeSegments(file).map((route) => [route, screen] as const)),
    ),
  );
  return (segments: readonly string[]): MobileScreen | null => {
    const key = segments.join('/');
    return screensBySegments.get(key) ?? screensBySegments.get(`${key}/index`) ?? null;
  };
}
