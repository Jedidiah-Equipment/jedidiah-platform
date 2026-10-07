import { describe, expect, it } from 'vitest';

import { isFleetNavPath, isImplementsNavPath, isMachinesNavPath, isWorkshopNavPath } from './nav-sections.js';

describe('contracting fleet nav active state', () => {
  it('keeps Machines, Implements and Categories apart under the fleet routes', () => {
    const machineEdit = '/contracting/fleet/9bd0c2cb-d97f-4b34-beba-c03e5541c96d/edit';
    const implementEdit = '/contracting/fleet/implements/9bd0c2cb-d97f-4b34-beba-c03e5541c96d/edit';
    const categories = '/contracting/fleet/categories';

    expect([isFleetNavPath, isMachinesNavPath, isImplementsNavPath].map((match) => match(machineEdit))).toEqual([
      true,
      true,
      false,
    ]);
    expect([isFleetNavPath, isMachinesNavPath, isImplementsNavPath].map((match) => match(implementEdit))).toEqual([
      true,
      false,
      true,
    ]);
    expect([isFleetNavPath, isMachinesNavPath, isImplementsNavPath].map((match) => match(categories))).toEqual([
      false,
      false,
      false,
    ]);
  });
});

describe('contracting workshop nav active state', () => {
  it('stays active on a Breakdown and leaves the fleet routes alone', () => {
    expect(isWorkshopNavPath('/contracting/workshop')).toBe(true);
    expect(isWorkshopNavPath('/contracting/workshop/9bd0c2cb-d97f-4b34-beba-c03e5541c96d')).toBe(true);
    expect(isWorkshopNavPath('/contracting/fleet')).toBe(false);
  });
});
