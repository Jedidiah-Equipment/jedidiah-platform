import type { AppPermission } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { getVisibleNavSections } from './AppNavMain.js';

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
      'Purchase Orders',
      'Close-out',
    ]);
    expect(inventory?.items.find((item) => item.title === 'Inventory')?.link.activeOptions).toEqual({ exact: true });
  });

  it('shows the Inventory section when any permitted item is visible', () => {
    const permissions = new Set<AppPermission>(['supplier:read']);
    const sections = getVisibleNavSections((permission) => permission === undefined || permissions.has(permission));
    const inventory = sections.find((section) => section.label === 'Inventory');

    expect(inventory?.items.map((item) => item.title)).toEqual(['Suppliers']);
  });
});
