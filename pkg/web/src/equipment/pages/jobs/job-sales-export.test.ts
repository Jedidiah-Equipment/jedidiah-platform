import { JobSalesExportRow } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { buildJobSalesExportCsv, createJobSalesExportFilename } from './job-sales-export.js';

// Parsed rather than cast: the contract brands half these fields, and a cast would let the fixture
// keep compiling against a shape the server can no longer produce.
function row(overrides: Partial<JobSalesExportRow> = {}): JobSalesExportRow {
  return JobSalesExportRow.parse({
    completedOn: '2026-07-15',
    costExVat: 4_000,
    costIncVat: 4_600,
    customerCompanyName: 'Riverside Farm',
    invoiceNumber: 'INV-2026-0044',
    jobCode: 'JOB-00042',
    productModelCode: 'SR-100',
    productName: 'Silage Trailer',
    productSerialNumber: 'SR-100260001',
    quoteCode: 'QUO-00031',
    retailExVat: 94_500,
    retailIncVat: 108_675,
    ...overrides,
  });
}

describe('job sales export', () => {
  it('writes money to the cent under the agreed columns', () => {
    const csv = buildJobSalesExportCsv([row()]);

    expect(csv).toBe(
      [
        'job_number,quote_number,invoice_number,customer,product_modelcode,product_name,serial_number,date_completed,cost_ex_vat,cost_inc_vat,retail_ex_vat,retail_inc_vat',
        'JOB-00042,QUO-00031,INV-2026-0044,Riverside Farm,SR-100,Silage Trailer,SR-100260001,2026-07-15,4000.00,4600.00,94500.00,108675.00',
      ].join('\r\n'),
    );
  });

  // The whole point of the null: an unpriced cost that arrives as 0.00 would total as free material.
  it('leaves an unknown cost blank rather than zero', () => {
    const csv = buildJobSalesExportCsv([row({ costExVat: null, costIncVat: null })]);

    expect(csv.split('\r\n')[1]).toContain(',SR-100260001,2026-07-15,,,94500.00,108675.00');
  });

  it('empties every column a Stock Build has no answer for', () => {
    const csv = buildJobSalesExportCsv([
      row({
        customerCompanyName: null,
        invoiceNumber: null,
        quoteCode: null,
        retailExVat: null,
        retailIncVat: null,
      }),
    ]);

    expect(csv.split('\r\n')[1]).toBe('JOB-00042,,,,SR-100,Silage Trailer,SR-100260001,2026-07-15,4000.00,4600.00,,');
  });

  it('defuses a customer name a spreadsheet would run as a formula', () => {
    const csv = buildJobSalesExportCsv([row({ customerCompanyName: '=HYPERLINK("https://example.com")' })]);

    expect(csv).toContain('"\'=HYPERLINK(""https://example.com"")"');
  });

  it('uses a date-stamped filename', () => {
    expect(createJobSalesExportFilename(new Date('2026-08-10T10:00:00Z'))).toBe('completed-jobs-2026-08-10.csv');
  });
});
