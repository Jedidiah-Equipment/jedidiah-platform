import { z } from 'zod';

import type { PartStockTrackingMode } from '../parts/part.js';

/**
 * The two standing counting rhythms (spec §9). A scope names *which shelf is being walked*, not a
 * stored membership list: a Part belongs to the scope its Stock Tracking Mode implies at the moment
 * it is counted, so re-classifying a Part moves it between rhythms without touching a session.
 *
 * Kept in a module of its own because the ledger names a scope too — a stock-count row points back
 * at the walk that posted it — and the session shapes beside it are built *on* the ledger's own.
 */
export type StocktakeScope = z.infer<typeof StocktakeScope>;
export const StocktakeScope = z.enum(['raw-material', 'stores']);

export const STOCKTAKE_SCOPE_LABELS = {
  'raw-material': 'Raw material',
  stores: 'Stores',
} as const satisfies Record<StocktakeScope, string>;

/** The one mapping from a rhythm to the Parts it walks; membership is derived through it, never stored. */
export const STOCKTAKE_SCOPE_TRACKING_MODE = {
  'raw-material': 'periodic',
  stores: 'perpetual',
} as const satisfies Record<StocktakeScope, PartStockTrackingMode>;
