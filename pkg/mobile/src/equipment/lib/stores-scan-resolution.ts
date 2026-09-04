import { parseScanToken } from '@pkg/domain/equipment';
import type { QuickSwitchActor } from '@pkg/schema/equipment';

/**
 * What a scan at the stores tablet should *do*, decided apart from the doing of it.
 *
 * The decision is the interesting part and the navigation is not, so this owns the first and the
 * hook owns the second. The lookups are injected, which is what lets the whole resolution — badge
 * before Part code, unknown badge before unknown code, and the messages a person at a shelf reads —
 * be exercised without a router, a query client, or a rendered tree.
 */
export type ScanResolution =
  | { kind: 'ignored' }
  | { kind: 'actor'; actor: QuickSwitchActor }
  | { kind: 'part'; partCode: string }
  | { kind: 'error'; message: string };

/**
 * A scan into a field that only wants a badge — the quick-switch dialog's own.
 *
 * Separate from `resolveScan` rather than the same call with a stubbed Part lookup: this field
 * genuinely cannot resolve a Part, and saying so is both honest and the only way it can tell the
 * reader they scanned the wrong label instead of failing as an unknown badge.
 */
export async function resolveBadgeScan({
  fetchActors,
  raw,
}: {
  fetchActors: () => Promise<{ items: QuickSwitchActor[] }>;
  raw: string;
}): Promise<ScanResolution> {
  const token = parseScanToken(raw);

  if (token.kind === 'empty') return { kind: 'ignored' };
  if (token.kind === 'part-code') return { kind: 'error', message: 'That is a Part label, not a badge card.' };

  let actors: { items: QuickSwitchActor[] };
  try {
    // Awaited rather than read off whatever a cache happens to hold: a card swiped while the list is
    // still loading would otherwise read as "not recognised", which sends somebody to the office.
    actors = await fetchActors();
  } catch {
    return { kind: 'error', message: 'Couldn’t check that badge. Try again, or pick a name from the list.' };
  }

  // Resolved against the same list the name grid offers, so a badge for somebody who has left — or
  // who never held the Stores role — fails here rather than at the first post.
  const actor = actors.items.find((candidate) => candidate.id === token.userId);

  return actor
    ? { actor, kind: 'actor' }
    : { kind: 'error', message: 'That badge is not recognised. Pick a name from the list instead.' };
}

/** A scan into the tablet's main field, which takes either kind of label. */
export async function resolveScan({
  fetchActors,
  fetchPartByCode,
  raw,
}: {
  fetchActors: () => Promise<{ items: QuickSwitchActor[] }>;
  fetchPartByCode: (code: string) => Promise<{ partCode: string }>;
  raw: string;
}): Promise<ScanResolution> {
  const token = parseScanToken(raw);

  if (token.kind !== 'part-code') return resolveBadgeScan({ fetchActors, raw });

  try {
    // Resolved before navigating: a code that names nothing has to fail here, at the shelf, rather
    // than push a screen that then says "not found".
    const part = await fetchPartByCode(token.partCode);

    return { kind: 'part', partCode: part.partCode };
  } catch {
    return {
      kind: 'error',
      message: `No Part carries the code ${token.partCode}. Search for it by name below.`,
    };
  }
}
