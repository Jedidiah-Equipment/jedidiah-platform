import type { CategoryIconGlyph } from '../category-icon-glyph.js';
import { genericImplement } from './generic-implement.js';

// PLACEHOLDER: draw the real "Ripper" glyph on the 24px / 2px-stroke grid, replace `paths`,
// then rename this file to `ripper.ts` and fix the import in `../category-icons.ts`.
export const ripper: CategoryIconGlyph = {
  key: 'ripper',
  label: 'Ripper',
  paths: genericImplement.paths,
};
