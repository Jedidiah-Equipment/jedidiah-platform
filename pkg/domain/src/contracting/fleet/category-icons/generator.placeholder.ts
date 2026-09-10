import type { CategoryIconGlyph } from '../category-icon-glyph.js';
import { genericMachine } from './generic-machine.js';

// PLACEHOLDER: draw the real "Generator" glyph on the 24px / 2px-stroke grid, replace `paths`,
// then rename this file to `generator.ts` and fix the import in `../category-icons.ts`.
export const generator: CategoryIconGlyph = {
  key: 'generator',
  label: 'Generator',
  paths: genericMachine.paths,
};
