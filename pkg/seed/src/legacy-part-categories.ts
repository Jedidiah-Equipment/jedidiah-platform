import { createHash } from 'node:crypto';

import { PartCategoryName, partCategoryLookupKey } from '@pkg/schema/equipment';

import type { SnapshotRow } from './snapshot-table-definitions.js';

/**
 * A snapshot captured before Part Categories existed carries each Part's category as a name and has
 * no `part_category.json`. Seeding it derives one Part Category per name ignoring casing and
 * whitespace runs, the most-used spelling winning — the same collapse migration 0158 performs — and gives
 * each a deterministic id so the Parts and the categories agree without seeing each other. Delete once
 * every snapshot source has been re-read after that migration.
 */
const PART_CATEGORY_ID_NAMESPACE = Buffer.from('6f1c2d4e9a3b4c5d8e7f0a1b2c3d4e5f', 'hex');

/** The category name a legacy Part row carries, with the one known bad value already corrected. */
export function legacyPartCategoryName(row: SnapshotRow): string | undefined {
  if (typeof row.category !== 'string') return undefined;
  if (row.code === 'SEMP-0001' && row.category === '6000') return 'Pipe';

  return PartCategoryName.safeParse(row.category).data;
}

/** A UUID v5 of the name's lookup key, so every spelling of one Part Category lands on the same id. */
export function legacyPartCategoryId(name: string): string {
  const hash = createHash('sha1').update(PART_CATEGORY_ID_NAMESPACE).update(partCategoryLookupKey(name)).digest();
  hash[6] = ((hash[6] ?? 0) & 0x0f) | 0x50;
  hash[8] = ((hash[8] ?? 0) & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function deriveLegacyPartCategories(legacyParts: readonly SnapshotRow[]): SnapshotRow[] {
  const usesBySpelling = new Map<string, number>();

  for (const part of legacyParts) {
    const name = legacyPartCategoryName(part);
    if (name) usesBySpelling.set(name, (usesBySpelling.get(name) ?? 0) + 1);
  }

  const winnerById = new Map<string, { name: string; uses: number }>();

  for (const [name, uses] of [...usesBySpelling].sort(([left], [right]) => (left < right ? -1 : 1))) {
    const id = legacyPartCategoryId(name);
    const current = winnerById.get(id);
    if (!current || uses > current.uses) winnerById.set(id, { name, uses });
  }

  return [...winnerById].map(([id, { name }]) => ({ id, name }));
}
