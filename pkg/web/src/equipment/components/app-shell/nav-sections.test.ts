import type { AppPermission } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { getVisibleNavSections } from '@/components/app-shell/NavSections.js';
import { equipmentNavSections, isInventoryNavPath } from './nav-sections.js';

describe('equipmentNavSections', () => {
  it('groups inventory links in the required order', () => {
    const sections = getVisibleNavSections(equipmentNavSections, () => true);
    expect(sections.find((section) => section.label === 'Admin')?.items.map((item) => item.title)).toEqual([
      'Bays',
      'Users',
      'Labor rates',
      'Product Ranges',
      'Translations',
      'Feedback',
      'Audit',
    ]);
    const operations = sections.find((section) => section.label === 'Operations');
    const inventory = sections.find((section) => section.label === 'Inventory');

    expect(operations?.items.map((item) => item.title)).toEqual(['Quotes', 'Jobs', 'Units', 'Customers', 'Products']);
    expect(inventory?.items.map((item) => item.title)).toEqual([
      'Suppliers',
      'Parts',
      'Inventory',
      'Buy list',
      'Purchase Orders',
      'PO vs invoiced',
      'Stocktake',
      'Close-out',
    ]);
    expect(inventory?.items.find((item) => item.title === 'Inventory')?.link.activeOptions).toEqual({ exact: true });
    expect(inventory?.items.find((item) => item.title === 'Purchase Orders')?.indicator).toBeDefined();
    expect(operations?.items.find((item) => item.title === 'Jobs')?.children?.map((child) => child.title)).toEqual([
      'Planning',
      'List',
      'Activity',
      'Calendar',
    ]);
    expect(
      operations?.items.find((item) => item.title === 'Jobs')?.children?.find((item) => item.title === 'Activity')
        ?.indicator,
    ).toBeDefined();
    expect(operations?.items.find((item) => item.title === 'Jobs')?.indicator).toBeDefined();
  });

  it('shows the Inventory section when any permitted item is visible', () => {
    const permissions = new Set<AppPermission>(['equipment_supplier:read']);
    const sections = getVisibleNavSections(
      equipmentNavSections,
      (permission) => permission === undefined || permissions.has(permission),
    );
    const inventory = sections.find((section) => section.label === 'Inventory');

    expect(inventory?.items.map((item) => item.title)).toEqual(['Suppliers']);
  });

  it('highlights Inventory history without highlighting the routes that own a nav item', () => {
    expect(isInventoryNavPath('/equipment/inventory')).toBe(true);
    expect(isInventoryNavPath('/equipment/inventory/9bd0c2cb-d97f-4b34-beba-c03e5541c96d')).toBe(true);
    expect(isInventoryNavPath('/equipment/inventory/close-out')).toBe(false);
    expect(isInventoryNavPath('/equipment/inventory/close-out/job-id')).toBe(false);
    expect(isInventoryNavPath('/equipment/inventory/buy-list')).toBe(false);
    expect(isInventoryNavPath('/equipment/inventory/price-variance')).toBe(false);
    expect(isInventoryNavPath('/equipment/inventory/stocktake')).toBe(false);
    expect(isInventoryNavPath('/equipment/inventory/stocktake/session-id')).toBe(false);
  });
});
