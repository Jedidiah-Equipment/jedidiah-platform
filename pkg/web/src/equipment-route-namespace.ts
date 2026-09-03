const LEGACY_EQUIPMENT_ROUTE_ROOTS = new Set([
  'audit',
  'bays',
  'catalog-translations',
  'customers',
  'dashboard',
  'feedback',
  'inventory',
  'jobs',
  'parts',
  'product-ranges',
  'products',
  'purchase-orders',
  'quotes',
  'suppliers',
  'units',
  'users',
]);

/** Keeps server redirects and client-side navigation aligned for every legacy equipment route. */
export function namespaceLegacyEquipmentPath(pathname: string): string {
  const routeRoot = pathname.split('/')[1];

  return routeRoot && LEGACY_EQUIPMENT_ROUTE_ROOTS.has(routeRoot) ? `/equipment${pathname}` : pathname;
}
