import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const simpleFormPartSelectors = [
  '../inventory/components/StockMovementDialog.tsx',
  '../inventory/components/StockAdjustmentDialog.tsx',
  '../inventory/components/StockRevaluationDialog.tsx',
] as const;

const controlledPartSelectors = [
  '../inventory/components/StockPartSelect.tsx',
  '../inventory/components/StockBuildDialog.tsx',
  './components/PartBomTab.tsx',
] as const;

describe('Part selector searchability', () => {
  it.each(simpleFormPartSelectors)('%s uses the searchable form field', (relativePath) => {
    expect(readSource(relativePath)).toContain('<field.ComboboxField');
  });

  it('keeps the Purchase Order line Part picker searchable', () => {
    const source = readSource('../purchase-orders/PurchaseOrderDetailPage.tsx');
    const partField = source.match(
      /<form\.AppField name={`lines\[\$\{index\}\]\.partId`}>[\s\S]*?<\/form\.AppField>/,
    )?.[0];

    expect(partField).toContain('<field.ComboboxField');
    expect(partField).not.toContain('<field.SelectField');
  });

  it.each(controlledPartSelectors)('%s uses the searchable controlled combobox', (relativePath) => {
    expect(readSource(relativePath)).toContain('<SearchableCombobox');
  });

  it('keeps the Product Assembly Part picker searchable', () => {
    expect(readSource('../products/components/ProductAssembliesEditor.tsx')).toMatch(
      /<ComboboxInput[\s\S]*?placeholder="Search parts"/,
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
