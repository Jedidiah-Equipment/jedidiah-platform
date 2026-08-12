import { ProductUnitStockExportRow } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { buildProductUnitStockExportCsv, createProductUnitStockExportFilename } from './product-unit-stock-export.js';

// Parsed rather than cast: the contract brands half these fields, and a cast would let the fixture
// keep compiling against a shape the server can no longer produce.
function row(overrides: Partial<ProductUnitStockExportRow> = {}): ProductUnitStockExportRow {
  return ProductUnitStockExportRow.parse({
    buildCompletedOn: '2026-07-15',
    costExVat: 4_000,
    costIncVat: 4_600,
    customerCompanyName: 'Riverside Farm',
    invoiceNumber: 'INV-2026-0044',
    jobCode: 'JOB-00042',
    productModelCode: 'SR-100',
    productName: 'Silage Trailer',
    productRetailExVat: 100_000,
    productRetailIncVat: 115_000,
    productSerialNumber: 'SR-100260001',
    quoteCode: 'QUO-00031',
    ...overrides,
  });
}

describe('product unit stock export', () => {
  it('writes money to the cent under the agreed columns', () => {
    const csv = buildProductUnitStockExportCsv([row()]);

    expect(csv).toBe(
      [
        'serial_number,product_modelcode,product_name,job_number,quote_number,invoice_number,customer,date_completed,cost_ex_vat,cost_inc_vat,product_retail_ex_vat,product_retail_inc_vat',
        'SR-100260001,SR-100,Silage Trailer,JOB-00042,QUO-00031,INV-2026-0044,Riverside Farm,2026-07-15,4000.00,4600.00,100000.00,115000.00',
      ].join('\r\n'),
    );
  });

  // The whole point of the null: an unpriced cost that arrives as 0.00 would total as free material.
  it('leaves an unknown cost blank rather than zero', () => {
    const csv = buildProductUnitStockExportCsv([row({ costExVat: null, costIncVat: null })]);

    expect(csv.split('\r\n')[1]).toContain(',2026-07-15,,,100000.00,115000.00');
  });

  it('empties every column a machine we still hold has no answer for', () => {
    const csv = buildProductUnitStockExportCsv([
      row({ customerCompanyName: null, invoiceNumber: null, quoteCode: null }),
    ]);

    expect(csv.split('\r\n')[1]).toBe(
      'SR-100260001,SR-100,Silage Trailer,JOB-00042,,,,2026-07-15,4000.00,4600.00,100000.00,115000.00',
    );
  });

  it('defuses a customer name a spreadsheet would run as a formula', () => {
    const csv = buildProductUnitStockExportCsv([row({ customerCompanyName: '=HYPERLINK("https://example.com")' })]);

    expect(csv).toContain('"\'=HYPERLINK(""https://example.com"")"');
  });

  it('uses a date-stamped filename', () => {
    expect(createProductUnitStockExportFilename(new Date('2026-08-12T10:00:00Z'))).toBe('unit-stock-2026-08-12.csv');
  });
});
