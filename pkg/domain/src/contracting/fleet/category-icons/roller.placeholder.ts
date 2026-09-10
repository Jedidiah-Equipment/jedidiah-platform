import type { CategoryIconGlyph } from '../category-icon-glyph.js';
import { genericMachine } from './generic-machine.js';

// PLACEHOLDER: draw the real "Roller" glyph on the 24px / 2px-stroke grid, replace `paths`,
// then rename this file to `roller.ts` and fix the import in `../category-icons.ts`.
export const roller: CategoryIconGlyph = {
  key: 'roller',
  label: 'Roller',
  paths: genericMachine.paths,
};
