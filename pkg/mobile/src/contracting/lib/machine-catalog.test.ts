import { UUID } from '@pkg/schema';
import { describe, expect, it } from 'vitest';
import { getMachineCategories, getVisibleMachines, normalizeMachineCategory } from './machine-catalog';

const hauler = UUID.parse('00000000-0000-4000-8000-000000000001');
const loader = UUID.parse('00000000-0000-4000-8000-000000000002');
const machines = [
  { id: hauler, code: 'BEL14-10', make: 'Bell', model: '1406', categoryId: hauler, categoryName: 'Hauler' },
  { id: loader, code: 'BEL14-2', make: 'Bell', model: '1406', categoryId: hauler, categoryName: 'Hauler' },
  {
    id: UUID.parse('00000000-0000-4000-8000-000000000003'),
    code: 'CAT-1',
    make: 'Caterpillar',
    model: '950',
    categoryId: loader,
    categoryName: 'Front End Loader',
  },
];

describe('Machine catalog', () => {
  it('sorts Machine Codes naturally without changing the saved fleet order', () => {
    expect(getVisibleMachines(machines, { search: '', category: 'all', sort: 'code' }).map((row) => row.code)).toEqual([
      'BEL14-2',
      'BEL14-10',
      'CAT-1',
    ]);
    expect(machines.map((row) => row.code)).toEqual(['BEL14-10', 'BEL14-2', 'CAT-1']);
  });

  it('sorts by Category with Machine Code as the tie-breaker', () => {
    expect(
      getVisibleMachines(machines, { search: '', category: 'all', sort: 'category' }).map((row) => row.code),
    ).toEqual(['CAT-1', 'BEL14-2', 'BEL14-10']);
  });

  it('combines Category with case-insensitive searches across code, make, and model', () => {
    for (const search of [' bel ', '1406', 'Bell']) {
      expect(getVisibleMachines(machines, { search, category: hauler, sort: 'code' })).toHaveLength(2);
    }
    expect(getVisibleMachines(machines, { search: 'caterpillar', category: hauler, sort: 'code' })).toEqual([]);
    expect(
      getVisibleMachines(machines, { search: 'caterpillar', category: 'all', sort: 'code' }).map((row) => row.code),
    ).toEqual(['CAT-1']);
  });

  it('deduplicates and orders Category options and falls back when a saved Category is absent', () => {
    const categories = getMachineCategories(machines);
    expect(categories).toEqual([
      { value: loader, label: 'Front End Loader' },
      { value: hauler, label: 'Hauler' },
    ]);
    expect(
      normalizeMachineCategory(
        'removed',
        categories.map((category) => category.value),
      ),
    ).toBe('all');
    expect(
      normalizeMachineCategory(
        hauler,
        categories.map((category) => category.value),
      ),
    ).toBe(hauler);
  });
});
