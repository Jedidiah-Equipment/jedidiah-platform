import type { BayListCard } from './use-bay-list';
import { createLiteralGuard } from './use-persisted-state';

/** Client-side ordering for the Bay grid: by the active Job's days-left, or by Bay name. */
export type BaySort = 'days-left' | 'name';

export const isBaySort = createLiteralGuard(['days-left', 'name']);

/**
 * Orders the Bay cards client-side. 'days-left' surfaces the most urgent active Jobs first
 * (fewest working days remaining); idle Bays have no countdown, so they sort by name after
 * the active ones. 'name' is a plain alphabetical Bay order. Returns a new array.
 */
export function sortBayCards(cards: readonly BayListCard[], sort: BaySort): BayListCard[] {
  const byName = (left: BayListCard, right: BayListCard) => left.name.localeCompare(right.name);

  if (sort === 'name') {
    return [...cards].sort(byName);
  }

  return [...cards].sort((left, right) => {
    if (left.active === null || right.active === null) {
      // Both idle keeps the name order; otherwise the idle Bay sorts last.
      if (left.active === right.active) return byName(left, right);

      return left.active === null ? 1 : -1;
    }

    return left.active.remainingWorkDays - right.active.remainingWorkDays || byName(left, right);
  });
}
