import { describe, expect, it } from 'vitest';

import { type InvoiceMatchOrderLine, matchInvoiceLines } from './invoice-match.js';

const BOLT: InvoiceMatchOrderLine = {
  orderedQuantity: 100,
  partCode: 'BOLT-M12-40',
  partId: '00000000-0000-4000-8000-000000000001',
  partName: 'Hex bolt M12x40 galvanised',
  supplierCode: 'SUP-9931',
  unitPrice: 12.5,
};

const NUT: InvoiceMatchOrderLine = {
  orderedQuantity: 200,
  partCode: 'NUT-M12',
  partId: '00000000-0000-4000-8000-000000000002',
  partName: 'Hex nut M12 galvanised',
  supplierCode: 'SUP-9932',
  unitPrice: 3,
};

function invoiceLine(overrides: Partial<Parameters<typeof matchInvoiceLines>[0]['invoiceLines'][number]> = {}) {
  return { description: '', partCode: null, quantity: null, unitPrice: null, ...overrides };
}

function flagKinds(rows: ReturnType<typeof matchInvoiceLines>): string[][] {
  return rows.map((row) => row.flags.map((flag) => flag.kind));
}

describe('matchInvoiceLines', () => {
  it('matches on an exact Part code before anything else, and clears a line that agrees', () => {
    const rows = matchInvoiceLines({
      invoiceLines: [
        invoiceLine({ description: 'assorted fasteners', partCode: 'bolt-m12-40', quantity: 100, unitPrice: 12.5 }),
      ],
      orderLines: [BOLT, NUT],
    });

    expect(rows[0]).toMatchObject({ matchMethod: 'part-code', partId: BOLT.partId, flags: [] });
    expect(rows[1]).toMatchObject({ matchMethod: 'none', partId: NUT.partId });
    expect(flagKinds(rows)).toEqual([[], ['unmatched-po-line']]);
  });

  it('reads a Part code through the punctuation and casing an invoice prints it in', () => {
    const rows = matchInvoiceLines({
      invoiceLines: [invoiceLine({ description: '', partCode: 'BOLT M12/40', quantity: 100, unitPrice: 12.5 })],
      orderLines: [BOLT],
    });

    expect(rows[0]).toMatchObject({ matchMethod: 'part-code', partId: BOLT.partId, flags: [] });
  });

  it('falls back to the Supplier code when the Part code is not the one printed', () => {
    const rows = matchInvoiceLines({
      invoiceLines: [invoiceLine({ description: 'fasteners', partCode: 'SUP-9932', quantity: 200, unitPrice: 3 })],
      orderLines: [BOLT, NUT],
    });

    expect(rows.find((row) => row.partId === NUT.partId)).toMatchObject({ matchMethod: 'supplier-code', flags: [] });
  });

  it('prefers a Part-code match over a Supplier-code match that would claim the same line', () => {
    // The first invoice line would match BOLT by description alone; the second names it outright.
    const rows = matchInvoiceLines({
      invoiceLines: [
        invoiceLine({ description: 'Hex bolt M12x40 galvanised', quantity: 100, unitPrice: 12.5 }),
        invoiceLine({ description: '', partCode: 'BOLT-M12-40', quantity: 100, unitPrice: 12.5 }),
      ],
      orderLines: [BOLT],
    });
    const matched = rows.find((row) => row.partId === BOLT.partId);

    expect(matched).toMatchObject({ matchMethod: 'part-code' });
    expect(rows.filter((row) => row.flags.some((flag) => flag.kind === 'unmatched-invoice-line'))).toHaveLength(1);
  });

  it('matches a fuzzy description the Supplier reworded', () => {
    const rows = matchInvoiceLines({
      invoiceLines: [invoiceLine({ description: 'HEX BOLT GALV M12 X 40MM', quantity: 100, unitPrice: 12.5 })],
      orderLines: [BOLT],
    });

    expect(rows[0]).toMatchObject({ matchMethod: 'description', partId: BOLT.partId, flags: [] });
  });

  it('leaves a description too far from anything on the order unmatched, both ways', () => {
    const rows = matchInvoiceLines({
      invoiceLines: [invoiceLine({ description: 'delivery surcharge', quantity: 1, unitPrice: 450 })],
      orderLines: [BOLT],
    });

    expect(flagKinds(rows)).toEqual([['unmatched-po-line'], ['unmatched-invoice-line']]);
    expect(rows[1]).toMatchObject({ description: 'delivery surcharge', matchMethod: 'none', partId: null });
  });

  it('never matches on a blank description, however close the numbers are', () => {
    const rows = matchInvoiceLines({
      invoiceLines: [invoiceLine({ description: '   ', quantity: 100, unitPrice: 12.5 })],
      orderLines: [BOLT],
    });

    expect(flagKinds(rows)).toEqual([['unmatched-po-line'], ['unmatched-invoice-line']]);
  });

  it('flags a price the Supplier billed above what the order agreed', () => {
    const rows = matchInvoiceLines({
      invoiceLines: [invoiceLine({ description: '', partCode: 'BOLT-M12-40', quantity: 100, unitPrice: 13.75 })],
      orderLines: [BOLT],
    });

    expect(flagKinds(rows)).toEqual([['price-mismatch']]);
    expect(rows[0]).toMatchObject({ invoiceUnitPrice: 13.75, unitPrice: 12.5 });
  });

  it('flags a quantity that disagrees with what the line ordered', () => {
    const rows = matchInvoiceLines({
      invoiceLines: [invoiceLine({ description: '', partCode: 'BOLT-M12-40', quantity: 90, unitPrice: 12.5 })],
      orderLines: [BOLT],
    });

    expect(flagKinds(rows)).toEqual([['quantity-mismatch']]);
  });

  it('flags both when both disagree, price first', () => {
    const rows = matchInvoiceLines({
      invoiceLines: [invoiceLine({ description: '', partCode: 'BOLT-M12-40', quantity: 90, unitPrice: 13.75 })],
      orderLines: [BOLT],
    });

    expect(flagKinds(rows)).toEqual([['price-mismatch', 'quantity-mismatch']]);
  });

  it('holds its tolerance at the cent and the thousandth, not at floating-point equality', () => {
    const rows = matchInvoiceLines({
      invoiceLines: [invoiceLine({ description: '', partCode: 'BOLT-M12-40', quantity: 0.1 + 0.2, unitPrice: 12.5 })],
      orderLines: [{ ...BOLT, orderedQuantity: 0.3 }],
    });

    expect(flagKinds(rows)).toEqual([[]]);
  });

  it('flags nothing about a number the invoice never printed', () => {
    const rows = matchInvoiceLines({
      invoiceLines: [invoiceLine({ description: '', partCode: 'BOLT-M12-40', quantity: null, unitPrice: null })],
      orderLines: [BOLT],
    });

    expect(flagKinds(rows)).toEqual([[]]);
  });

  it('flags nothing about a price the cost gate stripped from the order line', () => {
    const rows = matchInvoiceLines({
      invoiceLines: [invoiceLine({ description: '', partCode: 'BOLT-M12-40', quantity: 100, unitPrice: 99 })],
      orderLines: [{ ...BOLT, unitPrice: null }],
    });

    expect(flagKinds(rows)).toEqual([[]]);
  });

  it('claims each side at most once, so a repeated code leaves the second billing unmatched', () => {
    const rows = matchInvoiceLines({
      invoiceLines: [
        invoiceLine({ description: '', partCode: 'BOLT-M12-40', quantity: 60, unitPrice: 12.5 }),
        invoiceLine({ description: '', partCode: 'BOLT-M12-40', quantity: 40, unitPrice: 12.5 }),
      ],
      orderLines: [BOLT],
    });

    expect(flagKinds(rows)).toEqual([['quantity-mismatch'], ['unmatched-invoice-line']]);
  });

  it('keys every flag so a dismissal survives the panel being rebuilt', () => {
    const rows = matchInvoiceLines({
      invoiceLines: [
        invoiceLine({ description: '', partCode: 'BOLT-M12-40', quantity: 100, unitPrice: 13.75 }),
        invoiceLine({ description: 'delivery surcharge', quantity: 1, unitPrice: 450 }),
      ],
      orderLines: [BOLT, NUT],
    });

    expect(rows.flatMap((row) => row.flags.map((flag) => flag.key))).toEqual([
      `price-mismatch:${BOLT.partId}`,
      `unmatched-po-line:${NUT.partId}`,
      'unmatched-invoice-line:1',
    ]);
  });

  it('keys an unmatched invoice line by its position on the invoice, not by the row it lands in', () => {
    const rows = matchInvoiceLines({
      invoiceLines: [
        invoiceLine({ description: 'delivery surcharge', quantity: 1, unitPrice: 450 }),
        invoiceLine({ description: '', partCode: 'BOLT-M12-40', quantity: 100, unitPrice: 12.5 }),
      ],
      orderLines: [BOLT],
    });

    expect(rows.at(-1)?.flags.map((flag) => flag.key)).toEqual(['unmatched-invoice-line:0']);
  });

  it('reports every order line unmatched when the invoice carried no lines at all', () => {
    const rows = matchInvoiceLines({ invoiceLines: [], orderLines: [BOLT, NUT] });

    expect(flagKinds(rows)).toEqual([['unmatched-po-line'], ['unmatched-po-line']]);
  });

  it('is stable: the same input produces the same rows in the same order', () => {
    const input = {
      invoiceLines: [
        invoiceLine({ description: 'hex nut m12 galv', quantity: 200, unitPrice: 3 }),
        invoiceLine({ description: 'hex bolt m12 x 40 galv', quantity: 100, unitPrice: 12.5 }),
      ],
      orderLines: [BOLT, NUT],
    };

    expect(matchInvoiceLines(input)).toEqual(matchInvoiceLines(input));
    expect(matchInvoiceLines(input).map((row) => row.partId)).toEqual([BOLT.partId, NUT.partId]);
  });
});
