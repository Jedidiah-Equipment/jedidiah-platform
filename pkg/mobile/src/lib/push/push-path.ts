import { BUSINESSES } from '@pkg/schema';

const businessPath = new RegExp(`^/(${BUSINESSES.join('|')})/[^/]`);

/** The app path a push opens, from its data; only a path inside one of the businesses is followed. */
export function pushPathFromData(data: unknown): string | null {
  const path = (data as { path?: unknown } | null | undefined)?.path;
  if (typeof path !== 'string') return null;
  return businessPath.test(path) && !path.includes('//') ? path : null;
}
