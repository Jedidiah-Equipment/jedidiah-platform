import type { ProductUnitBuildState, ProductUnitDisplayBuildState, ProductUnitOwner } from '@pkg/schema';

import type { BadgeColorClassNames } from '../theme/status-badge.js';

/**
 * How a Unit's build reads to a person: Complete is On Hand plus an Owner. The machine has no third
 * build state — its build either finished or it did not — so this folds in the Owner at the surface
 * rather than asking the server to invent one, and the Units list filter offers the same three.
 */
export function toDisplayBuildState(
  buildState: ProductUnitBuildState,
  owner: ProductUnitOwner | null,
): ProductUnitDisplayBuildState {
  return buildState === 'on-hand' && owner ? 'complete' : buildState;
}

export const productUnitBuildStateLabels: Record<ProductUnitDisplayBuildState, string> = {
  complete: 'Complete',
  'in-build': 'In build',
  'on-hand': 'On hand',
};

/** Tailwind classes split so native surfaces can put the text colour on the Text element. */
export const productUnitBuildStateColorClassNames: Record<ProductUnitDisplayBuildState, BadgeColorClassNames> = {
  complete: {
    chip: 'border-slate-500/50 bg-slate-500/15',
    text: 'text-slate-800 dark:text-slate-200',
    textByScheme: { dark: 'text-slate-200', light: 'text-slate-800' },
  },
  'in-build': {
    chip: 'border-blue-500/50 bg-blue-500/15',
    text: 'text-blue-800 dark:text-blue-200',
    textByScheme: { dark: 'text-blue-200', light: 'text-blue-800' },
  },
  'on-hand': {
    chip: 'border-emerald-500/50 bg-emerald-500/15',
    text: 'text-emerald-800 dark:text-emerald-200',
    textByScheme: { dark: 'text-emerald-200', light: 'text-emerald-800' },
  },
};
