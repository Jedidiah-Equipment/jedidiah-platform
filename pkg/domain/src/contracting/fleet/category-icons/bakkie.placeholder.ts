import type { CategoryIconGlyph } from '../category-icon-glyph.js';
import { genericMachine } from './generic-machine.js';

// PLACEHOLDER: draw the real "Bakkie" glyph on the 24px / 2px-stroke grid, replace `paths`,
// then rename this file to `bakkie.ts` and fix the import in `../category-icons.ts`.
export const bakkie: CategoryIconGlyph = {
  key: 'bakkie',
  label: 'Bakkie',
  paths: genericMachine.paths,
};
