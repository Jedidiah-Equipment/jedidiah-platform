import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const formPartSelectors = [
  '../inventory/components/StockMovementDialog.tsx',
  '../inventory/components/StockAdjustmentDialog.tsx',
  '../inventory/components/StockRevaluationDialog.tsx',
  '../purchase-orders/PurchaseOrderDetailPage.tsx',
] as const;

const controlledPartSelectors = [
  '../inventory/components/StockPartSelect.tsx',
  '../inventory/components/StockBuildDialog.tsx',
  './components/PartBomTab.tsx',
] as const;

describe('Part selector searchability', () => {
  it.each(formPartSelectors)('%s uses the searchable form field', (relativePath) => {
    expect(readSource(relativePath)).toContain('<field.ComboboxField');
  });

  it.each(controlledPartSelectors)('%s uses the searchable controlled combobox', (relativePath) => {
    expect(readSource(relativePath)).toContain('<SearchableCombobox');
  });

  it('keeps the Product Assembly Part picker searchable', () => {
    expect(readSource('../products/components/ProductAssembliesEditor.tsx')).toMatch(
      /<ComboboxInput[\s\S]*?placeholder="Search Parts"/,
    );
  });

  it('keeps the batch-label Part picker searchable', () => {
    const source = readSource('./PartLabelBatchDialog.tsx');

    expect(source).toContain('<ComboboxChipsInput');
    expect(source).toContain('itemToStringLabel=');
    expect(source).not.toContain('itemToStringValue=');
  });
});

function readSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8');
}
