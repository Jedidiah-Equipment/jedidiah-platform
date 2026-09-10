import type { CategoryIconGlyph } from '../category-icon-glyph.js';
import { genericMachine } from './generic-machine.js';

// PLACEHOLDER: draw the real "Tipper" glyph on the 24px / 2px-stroke grid, replace `paths`,
// then rename this file to `tipper.ts` and fix the import in `../category-icons.ts`.
export const tipper: CategoryIconGlyph = {
  key: 'tipper',
  label: 'Tipper',
  paths: genericMachine.paths,
};
