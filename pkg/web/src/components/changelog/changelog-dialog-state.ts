import type { Changelog, ChangelogSection, ChangelogSurface } from '@pkg/schema';

/** Surface display order and labels for the dialog. */
export const CHANGELOG_SURFACE_ORDER = ['app', 'lander', 'mobile'] as const satisfies readonly ChangelogSurface[];

export const changelogSurfaceLabels: Record<ChangelogSurface, string> = {
  app: 'App',
  lander: 'Lander',
  mobile: 'Mobile',
};

/** Controls the user can press: the primary button (Next/Done), Skip, or a Close (X, backdrop, Esc). */
export type ChangelogControl = 'primary' | 'skip' | 'close';

export type ChangelogDialogState = {
  open: boolean;
  dismissed: boolean;
  pageIndex: number;
};

export type ChangelogDialogTransition = {
  state: ChangelogDialogState;
  /** The release to mark seen, or null when the control makes no server mutation (Next, Close). */
  markSeenReleasedAt: string | null;
};

export const initialChangelogDialogState: ChangelogDialogState = { dismissed: false, open: false, pageIndex: 0 };

export function shouldOpenChangelogDialog(changelogs: readonly Changelog[]): boolean {
  return changelogs.length > 0;
}

export function primaryControlLabel(pageIndex: number, count: number): 'Next' | 'Done' {
  return isLastPage(pageIndex, count) ? 'Done' : 'Next';
}

/**
 * Applies a pressed control to the dialog state. Next just pages forward. Done, Skip and Close all
 * close the dialog for the rest of this app load (`dismissed`), but only Done and Skip mark the
 * newest release seen — which advances the high-water mark past every release shown, so the dialog
 * stays gone. Close leaves the mark untouched, so a full reload brings the dialog back.
 */
export function reduceChangelogControl(
  state: ChangelogDialogState,
  control: ChangelogControl,
  changelogs: readonly Changelog[],
): ChangelogDialogTransition {
  if (control === 'primary' && !isLastPage(state.pageIndex, changelogs.length)) {
    return { markSeenReleasedAt: null, state: { ...state, pageIndex: state.pageIndex + 1 } };
  }

  const markSeenReleasedAt = control === 'close' ? null : acknowledgeableReleasedAt(changelogs);
  return { markSeenReleasedAt, state: { ...state, dismissed: true, open: false } };
}

/** The newest release in the set — the mark that acknowledges everything shown. */
export function acknowledgeableReleasedAt(changelogs: readonly Changelog[]): string | null {
  let newest: string | null = null;
  for (const changelog of changelogs) {
    if (newest === null || new Date(changelog.releasedAt).getTime() > new Date(newest).getTime()) {
      newest = changelog.releasedAt;
    }
  }
  return newest;
}

/** A release's sections in canonical Surface order, omitting Surfaces the release does not touch. */
export function orderedChangelogSections(changelog: Changelog): ChangelogSection[] {
  return CHANGELOG_SURFACE_ORDER.flatMap((surface) =>
    changelog.sections.filter((section) => section.surface === surface),
  );
}

function isLastPage(pageIndex: number, count: number): boolean {
  return pageIndex >= count - 1;
}
