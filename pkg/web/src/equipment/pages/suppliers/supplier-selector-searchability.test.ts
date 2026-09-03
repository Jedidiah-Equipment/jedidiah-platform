import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const supplierSelectors = [
  '../parts/components/PartForm.tsx',
  '../parts/PartListCreateDialog.tsx',
  '../purchase-orders/PurchaseOrderCreateDialog.tsx',
  '../purchase-orders/PurchaseOrderDetailPage.tsx',
] as const;

describe('Supplier selector searchability', () => {
  it.each(supplierSelectors)('%s uses the searchable form field', (relativePath) => {
    const source = readSource(relativePath);
    const supplierField = source.match(/<form\.AppField name="supplierId">[\s\S]*?<\/form\.AppField>/)?.[0];

    expect(supplierField).toContain('<field.ComboboxField');
    expect(supplierField).not.toContain('<field.SelectField');
  });
});

function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}
