/** How long a check stays fresh; a foreground within this window does not check again. */
export const updateCheckIntervalMs = 5 * 60_000;

type OfferedUpdate = { createdAt: Date; updateId: string | undefined } | undefined;

/** The part of expo's `useUpdates()` state the prompt reads. */
export type UpdateSnapshot = {
  availableUpdate: OfferedUpdate;
  downloadedUpdate: OfferedUpdate;
  isEnabled: boolean;
  isUpdateAvailable: boolean;
  isUpdatePending: boolean;
};

/**
 * Where the user is in accepting an update. Expo downloads in the background on its own, so this
 * tracks only what the *user* asked for — a background download must never raise a prompt.
 */
export type UpdateInstallState = 'failed' | 'idle' | 'installing';

/**
 * What the user is being shown, if anything. Every visible state names the update it is about, so
 * backing out of any of them records a dismissal against that update rather than updates at large.
 */
export type UpdatePromptState =
  | { kind: 'failed'; updateKey: string }
  | { kind: 'hidden' }
  | { kind: 'installing'; updateKey: string }
  | { kind: 'offered'; updateKey: string };

/**
 * Identifies the offered update so a dismissal sticks to that update alone and a later one asks
 * again. A rollback directive carries no id, so its commit time is the identity.
 */
function updateKeyOf(update: OfferedUpdate): string | null {
  if (!update) return null;

  return update.updateId ?? `rollback:${update.createdAt.toISOString()}`;
}

/**
 * The single decision behind the update prompt. Kept pure so the awkward cases — a build with
 * updates disabled, an update expo downloaded before anyone asked, a dismissal that must not
 * outlive the update it dismissed — are settled here rather than in a component.
 */
export function resolveUpdatePrompt({
  dismissedUpdateKey,
  installState,
  snapshot,
}: {
  dismissedUpdateKey: string | null;
  installState: UpdateInstallState;
  snapshot: UpdateSnapshot;
}): UpdatePromptState {
  if (!snapshot.isEnabled) return { kind: 'hidden' };

  const updateKey = updateKeyOf(snapshot.downloadedUpdate ?? snapshot.availableUpdate);
  if (updateKey === null || !(snapshot.isUpdateAvailable || snapshot.isUpdatePending)) return { kind: 'hidden' };

  // Both install states outrank the dismissal: the user asked for this update, so they are owed the
  // outcome whether it is still running or already failed.
  if (installState !== 'idle') return { kind: installState, updateKey };

  if (updateKey === dismissedUpdateKey) return { kind: 'hidden' };

  return { kind: 'offered', updateKey };
}

/**
 * Whether returning to the foreground should ask the update server again. Expo only checks at
 * launch, and this app stays open for days on a shop floor, so the foreground is the other moment
 * a new version can be noticed — throttled so a user flicking between apps is not a request storm.
 */
export function shouldCheckForUpdate({
  isChecking,
  isDownloading,
  isEnabled,
  lastCheckedAt,
  now,
}: {
  isChecking: boolean;
  isDownloading: boolean;
  isEnabled: boolean;
  lastCheckedAt: Date | undefined;
  now: number;
}): boolean {
  if (!isEnabled || isChecking || isDownloading) return false;
  if (!lastCheckedAt) return true;

  return now - lastCheckedAt.getTime() >= updateCheckIntervalMs;
}
