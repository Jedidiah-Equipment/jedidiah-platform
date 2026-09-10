import {
  type CategoryColour,
  type CategoryIconKey,
  type CategoryKind,
  categoryColours,
  categoryIconKeys,
} from '@pkg/schema/contracting';
import { type BadgeColorClassNames, statusBadgeColorClassNames } from '../../theme/status-badge.js';
import type { CategoryIconGlyph } from './category-icon-glyph.js';
import { bakkie } from './category-icons/bakkie.placeholder.js';
import { bulldozer } from './category-icons/bulldozer.js';
import { disc } from './category-icons/disc.placeholder.js';
import { excavator } from './category-icons/excavator.placeholder.js';
import { frontEndLoader } from './category-icons/front-end-loader.placeholder.js';
import { generator } from './category-icons/generator.placeholder.js';
import { genericImplement } from './category-icons/generic-implement.js';
import { genericMachine } from './category-icons/generic-machine.js';
import { grader } from './category-icons/grader.placeholder.js';
import { gravelTrailer } from './category-icons/gravel-trailer.placeholder.js';
import { lowbed } from './category-icons/lowbed.placeholder.js';
import { planter } from './category-icons/planter.placeholder.js';
import { plough } from './category-icons/plough.placeholder.js';
import { pump } from './category-icons/pump.placeholder.js';
import { ripper } from './category-icons/ripper.placeholder.js';
import { roller } from './category-icons/roller.placeholder.js';
import { slasher } from './category-icons/slasher.placeholder.js';
import { tipTrailer } from './category-icons/tip-trailer.placeholder.js';
import { tipper } from './category-icons/tipper.placeholder.js';
import { tlb } from './category-icons/tlb.js';
import { tractor } from './category-icons/tractor.js';
import { waterTanker } from './category-icons/water-tanker.placeholder.js';

export type { CategoryIconGlyph } from './category-icon-glyph.js';

const glyphs = [
  genericMachine,
  genericImplement,
  bakkie,
  bulldozer,
  excavator,
  frontEndLoader,
  generator,
  grader,
  lowbed,
  pump,
  roller,
  tipper,
  tlb,
  tractor,
  waterTanker,
  disc,
  gravelTrailer,
  planter,
  plough,
  ripper,
  slasher,
  tipTrailer,
] as const satisfies readonly CategoryIconGlyph[];

/** Every fleet glyph in picker order, one per key the schema accepts. */
export const categoryIcons: readonly CategoryIconGlyph[] = glyphs;
export const CATEGORY_ICON_VIEW_BOX = '0 0 24 24';
export const CATEGORY_ICON_STROKE_WIDTH = 2;
export function categoryIcon(key: CategoryIconKey): CategoryIconGlyph {
  const glyph = categoryIcons.find((icon) => icon.key === key);
  if (!glyph) throw new Error(`Unknown category icon ${key}`);
  return glyph;
}
export function defaultCategoryIcon(kind: CategoryKind): CategoryIconKey {
  return kind === 'machine' ? 'generic-machine' : 'generic-implement';
}
export const DEFAULT_CATEGORY_COLOUR: CategoryColour = 'gray';
/** The category colour palette is the shared status badge palette, keyed the same way. */
export const categoryColourClassNames: Record<CategoryColour, BadgeColorClassNames & { dot: string }> =
  statusBadgeColorClassNames;
export { categoryColours, categoryIconKeys };
