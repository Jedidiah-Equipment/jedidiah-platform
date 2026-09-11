import { BUSINESSES, type Business } from '@pkg/schema';

/** What a commit touches: a Business folder, or the shared root that serves both. */
export type Touch = Business | 'shared';

const TOUCH_ORDER: readonly Touch[] = [...BUSINESSES, 'shared'];

const IGNORED_PATH = /^(?:changelogs|docs)\/|\.md$|\.test\.[cm]?[jt]sx?$/;

/**
 * Classifies one touched path by the ADR 0016 wall: a `contracting/` or `equipment/` segment anywhere
 * under a layer package (a package `src` tree, the mobile `(protected)/<business>` routes), the web
 * `_authed.<business>.*` route files, or the lander (the Equipment marketing site). Paths that carry
 * no user-visible change — changelogs, docs, markdown, tests — return null; everything else is shared.
 */
export function classifyPath(path: string): Touch | null {
  if (IGNORED_PATH.test(path)) return null;
  if (path.startsWith('pkg/lander/')) return 'equipment';

  const segments = path.split('/');
  const file = segments[segments.length - 1] ?? '';
  for (const business of BUSINESSES) {
    if (segments.includes(business)) return business;
    if (file.startsWith(`_authed.${business}.`)) return business;
  }
  return 'shared';
}

/** The distinct touches across `paths`, in the fixed order equipment, contracting, shared. */
export function touchedBusinesses(paths: readonly string[]): Touch[] {
  const touches = new Set<Touch>();
  for (const path of paths) {
    const touch = classifyPath(path);
    if (touch) touches.add(touch);
  }
  return TOUCH_ORDER.filter((touch) => touches.has(touch));
}

/** The hint appended to a commit's subject line for the model. */
export function formatTouchHint(touches: readonly Touch[]): string {
  return `[touches: ${touches.length === 0 ? 'none' : touches.join(', ')}]`;
}
