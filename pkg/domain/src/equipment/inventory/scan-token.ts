/**
 * What a keyboard-wedge scan means (spec §10, §11).
 *
 * The stores tablet has one scan field and two kinds of label going into it: our own Code 128 Part
 * labels, and the badge cards the quick-switch reads. They are told apart by prefix rather than by
 * shape, because a Part code is free text — reserving a prefix is the only rule a new Part code
 * cannot accidentally collide with.
 */
export const BADGE_SCAN_PREFIX = 'badge:';

export type ScanToken = { kind: 'badge'; userId: string } | { kind: 'part-code'; partCode: string } | { kind: 'empty' };

/** The payload a badge card's barcode carries for `userId`. */
export function badgeScanToken(userId: string): string {
  return `${BADGE_SCAN_PREFIX}${userId}`;
}

export function parseScanToken(raw: string): ScanToken {
  const scanned = raw.trim();

  if (scanned.toLowerCase().startsWith(BADGE_SCAN_PREFIX)) {
    const userId = scanned.slice(BADGE_SCAN_PREFIX.length).trim();

    return userId === '' ? { kind: 'empty' } : { kind: 'badge', userId };
  }

  return scanned === '' ? { kind: 'empty' } : { kind: 'part-code', partCode: scanned };
}

/**
 * How long the tablet holds a person before it forgets them (spec §11).
 *
 * Short enough that the next person to walk up cannot post under the last one's name, long enough to
 * survive fetching a part off a shelf. No PIN backs this up in v1, so the timeout *is* the control.
 */
export const STORES_ACTOR_IDLE_TIMEOUT_MS = 3 * 60_000;

/**
 * Expiry is `>=` so the boundary tick clears rather than attributes, and a clock that steps backwards
 * holds the actor instead of dropping them: a negative idle is a wrong clock, never a long absence.
 */
export function isStoresActorExpired({ lastInteractionAt, now }: { lastInteractionAt: number; now: number }): boolean {
  return now - lastInteractionAt >= STORES_ACTOR_IDLE_TIMEOUT_MS;
}
