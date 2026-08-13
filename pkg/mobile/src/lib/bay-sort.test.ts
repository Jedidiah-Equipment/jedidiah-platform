import type { Department } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { type BaySort, filterBayCards, groupBayCardsByDepartment, isBaySort, sortBayCards } from './bay-sort';
import type { BayListCard } from './use-bay-list';

// A Bay card reduced to the fields sortBayCards reads; the rest of BayListCard is irrelevant here.
function card(name: string, remainingWorkDays: number | null, department: Department = 'assembly'): BayListCard {
  return {
    id: name,
    name,
    department,
    operator: null,
    active: remainingWorkDays === null ? null : ({ remainingWorkDays } as BayListCard['active']),
  };
}

const names = (cards: readonly BayListCard[]) => cards.map((bay) => bay.name);

describe('isBaySort', () => {
  it('accepts the known sort modes', () => {
    expect(isBaySort('days-left')).toBe(true);
    expect(isBaySort('name')).toBe(true);
  });

  it('rejects anything else', () => {
    for (const value of ['', 'Days-Left', 'department', null, undefined, 0, {}]) {
      expect(isBaySort(value)).toBe(false);
    }
  });
});

describe('sortBayCards', () => {
  it("orders by name for the 'name' sort", () => {
    const cards = [card('Paint Bay 2', 1), card('Assembly Bay 1', 9), card('Paint Bay 1', 5)];

    expect(names(sortBayCards(cards, 'name'))).toEqual(['Assembly Bay 1', 'Paint Bay 1', 'Paint Bay 2']);
  });

  it("orders active bays by fewest days left for the 'days-left' sort", () => {
    const cards = [card('Bay A', 9), card('Bay B', 2), card('Bay C', 5)];

    expect(names(sortBayCards(cards, 'days-left'))).toEqual(['Bay B', 'Bay C', 'Bay A']);
  });

  it('breaks days-left ties by bay name', () => {
    const cards = [card('Bay Z', 3), card('Bay A', 3)];

    expect(names(sortBayCards(cards, 'days-left'))).toEqual(['Bay A', 'Bay Z']);
  });

  it('sorts idle bays (no active job) after active ones, by name', () => {
    const cards = [card('Idle Z', null), card('Active', 7), card('Idle A', null)];

    expect(names(sortBayCards(cards, 'days-left'))).toEqual(['Active', 'Idle A', 'Idle Z']);
  });

  it('does not mutate the input array', () => {
    const cards = [card('Bay A', 9), card('Bay B', 2)];
    const original = [...cards];

    sortBayCards(cards, 'days-left');

    expect(cards).toEqual(original);
  });

  it('handles an empty list', () => {
    expect(sortBayCards([], 'days-left' satisfies BaySort)).toEqual([]);
  });
});

describe('groupBayCardsByDepartment', () => {
  it('orders groups by the fixed department pipeline, not by encounter order', () => {
    const cards = [card('Workshop 1', 1, 'workshop'), card('Paint 1', 2, 'paint'), card('Fab 1', 3, 'fabrication')];

    expect(groupBayCardsByDepartment(cards).map((group) => group.department)).toEqual([
      'fabrication',
      'paint',
      'workshop',
    ]);
  });

  it('keeps the incoming order of bays within a department, so the sort control still decides it', () => {
    const cards = sortBayCards(
      [card('Paint Z', 1, 'paint'), card('Fab A', 9, 'fabrication'), card('Paint A', 4, 'paint')],
      'days-left',
    );

    expect(groupBayCardsByDepartment(cards).map((group) => group.bays.map((bay) => bay.name))).toEqual([
      ['Fab A'],
      ['Paint Z', 'Paint A'],
    ]);
  });

  it('omits departments with no bays', () => {
    const groups = groupBayCardsByDepartment([card('Supply 1', 1, 'supply')]);

    expect(groups).toHaveLength(1);
    expect(groups[0]?.department).toBe('supply');
  });

  it('does not mutate the input array', () => {
    const cards = [card('Workshop 1', 1, 'workshop'), card('Fab 1', 3, 'fabrication')];
    const original = [...cards];

    groupBayCardsByDepartment(cards);

    expect(cards).toEqual(original);
  });

  it('handles an empty list', () => {
    expect(groupBayCardsByDepartment([])).toEqual([]);
  });
});

describe('filterBayCards', () => {
  const searchable: BayListCard = {
    id: 'bay-1',
    name: 'Assembly Bay 2',
    department: 'assembly',
    operator: { email: 'lindi@example.com', id: 'user-1', name: 'Lindi', thumbnailDataUrl: null },
    active: {
      customerCompanyName: 'Acme Farms',
      jobCode: 'JOB-0042',
      jobDisplayName: 'Square Baler',
    } as BayListCard['active'],
  };

  it.each(['assembly', 'LINDI', 'job-0042', 'baler', 'acme'])('matches the visible fact %s', (search) => {
    expect(filterBayCards([searchable], search)).toEqual([searchable]);
  });

  it('matches Stock for an active Job without a Customer and leaves the input untouched', () => {
    const stock = { ...searchable, active: { ...searchable.active, customerCompanyName: null } } as BayListCard;
    const input = [searchable, stock];

    expect(filterBayCards(input, 'stock')).toEqual([stock]);
    expect(filterBayCards(input, '')).toEqual(input);
    expect(filterBayCards(input, '')).not.toBe(input);
  });
});
