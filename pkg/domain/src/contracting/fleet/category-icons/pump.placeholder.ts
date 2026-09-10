import type { CategoryIconGlyph } from '../category-icon-glyph.js';
import { genericMachine } from './generic-machine.js';

// PLACEHOLDER: draw the real "Pump" glyph on the 24px / 2px-stroke grid, replace `paths`,
// then rename this file to `pump.ts` and fix the import in `../category-icons.ts`.
export const pump: CategoryIconGlyph = {
  key: 'pump',
  label: 'Pump',
  paths: genericMachine.paths,
};
