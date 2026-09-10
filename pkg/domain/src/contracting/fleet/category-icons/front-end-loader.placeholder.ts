import type { CategoryIconGlyph } from '../category-icon-glyph.js';
import { genericMachine } from './generic-machine.js';

// PLACEHOLDER: draw the real "Front-end loader" glyph on the 24px / 2px-stroke grid, replace `paths`,
// then rename this file to `front-end-loader.ts` and fix the import in `../category-icons.ts`.
export const frontEndLoader: CategoryIconGlyph = {
  key: 'front-end-loader',
  label: 'Front-end loader',
  paths: genericMachine.paths,
};
