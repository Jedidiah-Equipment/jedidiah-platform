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

/** The update worth offering, and whether accepting it still needs a download. */
export type OfferedUpdateSelection = { isDownloaded: boolean; key: string };

/**
 * Identifies an update so a dismissal sticks to that update alone and a later one asks again. A
 * rollback directive carries no id, and expo blanks an id it cannot read out of a manifest, so the
 * commit time identifies both of those.
 */
function updateKeyOf(update: OfferedUpdate): string | null {
  if (!update) return null;

  return update.updateId || `at:${update.createdAt.toISOString()}`;
}

function newest(first: OfferedUpdate, second: OfferedUpdate): OfferedUpdate {
  if (!first) return second;
  if (!second) return first;

  return second.createdAt.getTime() > first.createdAt.getTime() ? second : first;
}

/**
 * Which update the user should be asked about. Expo refreshes `availableUpdate` on every check but
 * leaves `downloadedUpdate` holding whatever was last actually fetched, so on a session that runs
 * for days the downloaded one can be the older of the two — offering it would strand every update
 * published since. The newest wins, and the caller is told whether it still needs downloading.
 */
export function selectOfferedUpdate(snapshot: UpdateSnapshot): OfferedUpdateSelection | null {
  if (!snapshot.isEnabled || !(snapshot.isUpdateAvailable || snapshot.isUpdatePending)) return null;

  const key = updateKeyOf(newest(snapshot.downloadedUpdate, snapshot.availableUpdate));
  if (key === null) return null;

  return { isDownloaded: updateKeyOf(snapshot.downloadedUpdate) === key, key };
}

/**
 * The single decision behind the update prompt. Kept pure so the awkward cases — a build with
 * updates disabled, an update expo downloaded before anyone asked, a dismissal that must not
 * outlive the update it dismissed — are settled here rather than in a component.
 */
export function resolveUpdatePrompt({
  dismissedUpdateKey,
  installState,
  installUpdateKey,
  snapshot,
}: {
  dismissedUpdateKey: string | null;
  installState: UpdateInstallState;
  installUpdateKey: string | null;
  snapshot: UpdateSnapshot;
}): UpdatePromptState {
  const offered = selectOfferedUpdate(snapshot);
  if (!offered) return { kind: 'hidden' };

  // An install outranks the dismissal — the user asked for this update, so they are owed the
  // outcome — but only for the update they actually asked about. A newer one starts over.
  if (installState !== 'idle' && installUpdateKey === offered.key) {
    return { kind: installState, updateKey: offered.key };
  }

  if (offered.key === dismissedUpdateKey) return { kind: 'hidden' };

  return { kind: 'offered', updateKey: offered.key };
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
