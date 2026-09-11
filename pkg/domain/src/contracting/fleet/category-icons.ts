import {
  type CategoryColour,
  type CategoryIconKey,
  type CategoryKind,
  categoryColours,
  categoryIconKeys,
} from '@pkg/schema/contracting';
import { type BadgeColorClassNames, statusBadgeColorClassNames } from '../../theme/status-badge.js';
import type { CategoryIconGlyph } from './category-icon-glyph.js';
import { bakkie } from './category-icons/bakkie.js';
import { bulldozer } from './category-icons/bulldozer.js';
import { disc } from './category-icons/disc.js';
import { excavator } from './category-icons/excavator.js';
import { frontEndLoader } from './category-icons/front-end-loader.js';
import { generator } from './category-icons/generator.js';
import { genericImplement } from './category-icons/generic-implement.js';
import { genericMachine } from './category-icons/generic-machine.js';
import { grader } from './category-icons/grader.js';
import { gravelTrailer } from './category-icons/gravel-trailer.js';
import { lowbed } from './category-icons/lowbed.js';
import { planter } from './category-icons/planter.js';
import { plough } from './category-icons/plough.js';
import { pump } from './category-icons/pump.js';
import { ripper } from './category-icons/ripper.js';
import { roller } from './category-icons/roller.js';
import { slasher } from './category-icons/slasher.js';
import { tipTrailer } from './category-icons/tip-trailer.js';
import { tipper } from './category-icons/tipper.js';
import { tlb } from './category-icons/tlb.js';
import { tractor } from './category-icons/tractor.js';
import { waterTanker } from './category-icons/water-tanker.js';

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
/**
 * Never throws: the icon column has no DB check by design, so an installed mobile build older than
 * the release that added a glyph can meet a key it does not know. It draws the generic instead.
 */
export function categoryIcon(key: string): CategoryIconGlyph {
  return categoryIcons.find((icon) => icon.key === key) ?? genericMachine;
}
export function defaultCategoryIcon(kind: CategoryKind): CategoryIconKey {
  return kind === 'machine' ? 'generic-machine' : 'generic-implement';
}
export const DEFAULT_CATEGORY_COLOUR: CategoryColour = 'gray';
/** The category colour palette is the shared status badge palette, keyed the same way. */
export const categoryColourClassNames: Record<CategoryColour, BadgeColorClassNames & { dot: string }> =
  statusBadgeColorClassNames;
export { categoryColours, categoryIconKeys };
