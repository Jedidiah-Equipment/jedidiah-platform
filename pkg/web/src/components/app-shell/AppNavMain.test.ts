import type { AppPermission } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { getVisibleNavSections, isInventoryNavPath, navAccessState } from './AppNavMain.js';

describe('AppNavMain', () => {
  it('groups inventory links in the required order', () => {
    const sections = getVisibleNavSections(() => true);
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
    const permissions = new Set<AppPermission>(['supplier:read']);
    const sections = getVisibleNavSections((permission) => permission === undefined || permissions.has(permission));
    const inventory = sections.find((section) => section.label === 'Inventory');

    expect(inventory?.items.map((item) => item.title)).toEqual(['Suppliers']);
  });

  it('keeps a failed access check distinct from an account with no permissions', () => {
    expect(navAccessState({ isLoadingError: false, isPending: true })).toBe('checking');
    expect(navAccessState({ isLoadingError: true, isPending: false })).toBe('unavailable');
    // Resolved, whatever it resolved to: a permission-less account is a real answer, not a failure.
    expect(navAccessState({ isLoadingError: false, isPending: false })).toBe('ready');
  });

  it('highlights Inventory history without highlighting the routes that own a nav item', () => {
    expect(isInventoryNavPath('/inventory')).toBe(true);
    expect(isInventoryNavPath('/inventory/9bd0c2cb-d97f-4b34-beba-c03e5541c96d')).toBe(true);
    expect(isInventoryNavPath('/inventory/close-out')).toBe(false);
    expect(isInventoryNavPath('/inventory/close-out/job-id')).toBe(false);
    expect(isInventoryNavPath('/inventory/buy-list')).toBe(false);
    expect(isInventoryNavPath('/inventory/price-variance')).toBe(false);
    expect(isInventoryNavPath('/inventory/stocktake')).toBe(false);
    expect(isInventoryNavPath('/inventory/stocktake/session-id')).toBe(false);
  });
});
