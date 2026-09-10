import type { CategoryIconGlyph } from '../category-icon-glyph.js';
import { genericImplement } from './generic-implement.js';

// PLACEHOLDER: draw the real "Disc" glyph on the 24px / 2px-stroke grid, replace `paths`,
// then rename this file to `disc.ts` and fix the import in `../category-icons.ts`.
export const disc: CategoryIconGlyph = {
  key: 'disc',
  label: 'Disc',
  paths: genericImplement.paths,
};
