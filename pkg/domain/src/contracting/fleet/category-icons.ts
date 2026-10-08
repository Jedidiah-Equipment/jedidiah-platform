import {
  type CategoryColour,
  type CategoryIconKey,
  type CategoryKind,
  categoryColours,
  categoryIconKeys,
} from '@pkg/schema/contracting';
import type { BadgeColorClassNames } from '../../theme/status-badge.js';
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
export const DEFAULT_CATEGORY_COLOUR: CategoryColour = 'indigo';
/**
 * The category palette: its own hues, apart from the status badge palette, whose red, green, blue and grey mean
 * Breakdown status and urgency. Both scheme halves are literals so native gets a generated class for each.
 */
export const categoryColourClassNames = {
  yellow: {
    chip: 'border-yellow-500/50 bg-yellow-500/15',
    dot: 'bg-yellow-500',
    text: 'text-yellow-800 dark:text-yellow-200',
    textByScheme: { dark: 'text-yellow-200', light: 'text-yellow-800' },
  },
  orange: {
    chip: 'border-orange-500/50 bg-orange-500/15',
    dot: 'bg-orange-500',
    text: 'text-orange-800 dark:text-orange-200',
    textByScheme: { dark: 'text-orange-200', light: 'text-orange-800' },
  },
  lime: {
    chip: 'border-lime-500/50 bg-lime-500/15',
    dot: 'bg-lime-500',
    text: 'text-lime-800 dark:text-lime-200',
    textByScheme: { dark: 'text-lime-200', light: 'text-lime-800' },
  },
  cyan: {
    chip: 'border-cyan-500/50 bg-cyan-500/15',
    dot: 'bg-cyan-500',
    text: 'text-cyan-800 dark:text-cyan-200',
    textByScheme: { dark: 'text-cyan-200', light: 'text-cyan-800' },
  },
  indigo: {
    chip: 'border-indigo-500/50 bg-indigo-500/15',
    dot: 'bg-indigo-500',
    text: 'text-indigo-800 dark:text-indigo-200',
    textByScheme: { dark: 'text-indigo-200', light: 'text-indigo-800' },
  },
  violet: {
    chip: 'border-violet-500/50 bg-violet-500/15',
    dot: 'bg-violet-500',
    text: 'text-violet-800 dark:text-violet-200',
    textByScheme: { dark: 'text-violet-200', light: 'text-violet-800' },
  },
  fuchsia: {
    chip: 'border-fuchsia-500/50 bg-fuchsia-500/15',
    dot: 'bg-fuchsia-500',
    text: 'text-fuchsia-800 dark:text-fuchsia-200',
    textByScheme: { dark: 'text-fuchsia-200', light: 'text-fuchsia-800' },
  },
  pink: {
    chip: 'border-pink-500/50 bg-pink-500/15',
    dot: 'bg-pink-500',
    text: 'text-pink-800 dark:text-pink-200',
    textByScheme: { dark: 'text-pink-200', light: 'text-pink-800' },
  },
} as const satisfies Record<CategoryColour, BadgeColorClassNames & { dot: string }>;
export { categoryColours, categoryIconKeys };
