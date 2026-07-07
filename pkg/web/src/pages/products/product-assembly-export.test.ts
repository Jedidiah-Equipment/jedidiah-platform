import { describe, expect, it } from 'vitest';

import { buildProductAssemblyExportCsv, createProductAssemblyExportFilename } from './product-assembly-export.js';

describe('product assembly export', () => {
  it('builds the agreed CSV columns and leaves standard prices blank', () => {
    const csv = buildProductAssemblyExportCsv([
      {
        assemblyName: 'Main Frame',
        assemblyPrice: null,
        assemblyType: 'standard',
        productModelCode: 'AL6',
        productName: 'Auger Loader 6',
      },
      {
        assemblyName: 'Extended Hopper',
        assemblyPrice: '12500.00',
        assemblyType: 'optional',
        productModelCode: 'AL6',
        productName: 'Auger Loader 6',
      },
    ]);

    expect(csv).toBe(
      [
        'product_modelcode,product_name,assembly_type,assembly_name,assembly_price',
        'AL6,Auger Loader 6,standard,Main Frame,',
        'AL6,Auger Loader 6,optional,Extended Hopper,12500.00',
      ].join('\r\n'),
    );
  });

  it('uses a date-stamped filename', () => {
    expect(createProductAssemblyExportFilename(new Date('2026-07-07T10:00:00Z'))).toBe(
      'product-assemblies-2026-07-07.csv',
    );
  });
});
