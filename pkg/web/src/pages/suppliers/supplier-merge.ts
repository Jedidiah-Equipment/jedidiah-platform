import type { Supplier, SupplierMergePreview } from '@pkg/schema';

export function getSupplierMergeOptions(suppliers: readonly Supplier[], sourceId: string) {
  return suppliers
    .filter((supplier) => supplier.id !== sourceId)
    .map((supplier) => ({ label: supplier.companyName, value: supplier.id }));
}

export function formatSupplierMergeConfirmation({
  partCount,
  purchaseOrderCount,
  sourceName,
  targetName,
}: SupplierMergePreview & { sourceName: string; targetName: string }): string {
  const parts = `${partCount} ${partCount === 1 ? 'part' : 'parts'}`;
  const purchaseOrders = `${purchaseOrderCount} ${purchaseOrderCount === 1 ? 'purchase order' : 'purchase orders'}`;
  return `${parts} and ${purchaseOrders} will move to ${targetName}. ${sourceName} will be deleted. This cannot be undone.`;
}
