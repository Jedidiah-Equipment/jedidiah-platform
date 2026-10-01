import { formatDate, formatNumber } from '@pkg/domain';
import type { Customer, CustomerMergePreview } from '@pkg/schema/equipment';

export function getCustomerMergeOptions(customers: readonly Customer[], sourceId: string) {
  return customers
    .filter((customer) => customer.id !== sourceId)
    .map((customer) => ({
      label: `${customer.companyName} — ${customer.contactPerson ? `${customer.contactPerson} · ` : ''}created ${formatDate(customer.createdAt, 'short')}`,
      value: customer.id,
    }));
}

export function formatCustomerMergeConfirmation({
  quoteCount,
  unitCount,
  sourceName,
  targetName,
}: CustomerMergePreview & { sourceName: string; targetName: string }): string {
  const quotes = `${formatNumber(quoteCount)} ${quoteCount === 1 ? 'quote' : 'quotes'}`;
  const units = `${formatNumber(unitCount)} ${unitCount === 1 ? 'unit' : 'units'}`;
  return `${quotes} and ${units} will move to ${targetName}. ${sourceName} will be deleted. This cannot be undone.`;
}
