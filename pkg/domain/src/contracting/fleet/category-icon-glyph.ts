/**
 * One fleet glyph on Tabler's grid: a 24×24 viewBox, 2px round-capped strokes in `currentColor`,
 * no fills. `paths` are SVG `d` strings only, so both apps draw them with their own svg primitive and
 * `category-icons.test.ts` can hold every file to the contract.
 */
import type { CategoryIconKey } from '@pkg/schema/contracting';

export type CategoryIconGlyph = {
  key: CategoryIconKey;
  label: string;
  paths: readonly string[];
};
