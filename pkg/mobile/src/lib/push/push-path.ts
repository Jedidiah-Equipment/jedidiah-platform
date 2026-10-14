import { BUSINESSES } from '@pkg/schema';

const businessPath = new RegExp(`^/(${BUSINESSES.join('|')})/[^/]`);

/** Where a tapped push opens: the path to push, and its pathname without the query, which the router reports there. */
export type PushTarget = { href: string; pathname: string };

/** The app path a push opens, from its data; only a path inside one of the businesses is followed. */
export function pushTargetFromData(data: unknown): PushTarget | null {
  const path = (data as { path?: unknown } | null | undefined)?.path;
  if (typeof path !== 'string' || !businessPath.test(path) || path.includes('//')) return null;
  const query = path.indexOf('?');
  return { href: path, pathname: query === -1 ? path : path.slice(0, query) };
}
