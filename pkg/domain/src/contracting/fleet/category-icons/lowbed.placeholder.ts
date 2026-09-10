import type { CategoryIconGlyph } from '../category-icon-glyph.js';
import { genericMachine } from './generic-machine.js';

// PLACEHOLDER: draw the real "Lowbed" glyph on the 24px / 2px-stroke grid, replace `paths`,
// then rename this file to `lowbed.ts` and fix the import in `../category-icons.ts`.
export const lowbed: CategoryIconGlyph = {
  key: 'lowbed',
  label: 'Lowbed',
  paths: genericMachine.paths,
};
