/**
 * One fleet glyph on Tabler's grid: a 24×24 viewBox, 2px round-capped strokes in `currentColor`,
 * no fills. `paths` are SVG `d` strings only, so both apps draw them with their own svg primitive and
 * `category-icons.test.ts` can hold every file to the contract.
 */
export type CategoryIconGlyph = {
  key: string;
  label: string;
  paths: readonly string[];
};
