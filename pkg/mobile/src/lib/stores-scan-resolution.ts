import { parseScanToken } from '@pkg/domain';
import type { QuickSwitchActor } from '@pkg/schema';

/**
 * What a scan at the stores tablet should *do*, decided apart from the doing of it.
 *
 * The decision is the interesting part and the navigation is not, so this owns the first and the
 * hook owns the second. Both lookups are injected, which is what lets the whole resolution — badge
 * before Part code, unknown badge before unknown code, and the messages a person at a shelf reads —
 * be exercised without a router, a query client, or a rendered tree.
 */
export type ScanResolution =
  | { kind: 'ignored' }
  | { kind: 'actor'; actor: QuickSwitchActor }
  | { kind: 'part'; partCode: string }
  | { kind: 'error'; message: string };

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

  if (token.kind === 'empty') return { kind: 'ignored' };

  if (token.kind === 'badge') {
    let actors: { items: QuickSwitchActor[] };
    try {
      actors = await fetchActors();
    } catch {
      return { kind: 'error', message: 'Couldn’t check that badge. Try again, or pick a name from the list.' };
    }

    // Resolved against the same list the name grid offers, so a badge for somebody who has left —
    // or who never held the Stores role — fails here rather than at the first post.
    const actor = actors.items.find((candidate) => candidate.id === token.userId);

    return actor
      ? { actor, kind: 'actor' }
      : { kind: 'error', message: 'That badge is not recognised. Pick a name from the list instead.' };
  }

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
