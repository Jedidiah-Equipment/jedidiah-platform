import type { CategoryIconGlyph } from '../category-icon-glyph.js';
import { genericMachine } from './generic-machine.js';

// PLACEHOLDER: draw the real "Grader" glyph on the 24px / 2px-stroke grid, replace `paths`,
// then rename this file to `grader.ts` and fix the import in `../category-icons.ts`.
export const grader: CategoryIconGlyph = {
  key: 'grader',
  label: 'Grader',
  paths: genericMachine.paths,
};
