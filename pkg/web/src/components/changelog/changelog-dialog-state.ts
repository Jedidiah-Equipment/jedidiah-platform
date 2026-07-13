import type { Changelog } from '@pkg/schema';

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

export function primaryControlLabel(pageIndex: number, count: number): 'Next' | 'Done' {
  return isLastPage(pageIndex, count) ? 'Done' : 'Next';
}

/**
 * Applies a pressed control to the dialog state. Next just pages forward. Done, Skip and Close all
 * close the dialog for the rest of this app load (`dismissed`), but only Done and Skip mark the
 * newest release seen — which advances the high-water mark past every release shown, so the dialog
 * stays gone. Close leaves the mark untouched, so a full reload brings the dialog back.
 *
 * `changelogs` are oldest-first (the API contract the pager also relies on), so the newest release —
 * the mark that acknowledges everything shown — is the last element.
 */
export function reduceChangelogControl(
  state: ChangelogDialogState,
  control: ChangelogControl,
  changelogs: readonly Changelog[],
): ChangelogDialogTransition {
  if (control === 'primary' && !isLastPage(state.pageIndex, changelogs.length)) {
    return { markSeenReleasedAt: null, state: { ...state, pageIndex: state.pageIndex + 1 } };
  }

  const newest = changelogs[changelogs.length - 1];
  const markSeenReleasedAt = control === 'close' ? null : (newest?.releasedAt ?? null);
  return { markSeenReleasedAt, state: { ...state, dismissed: true, open: false } };
}

function isLastPage(pageIndex: number, count: number): boolean {
  return pageIndex >= count - 1;
}
