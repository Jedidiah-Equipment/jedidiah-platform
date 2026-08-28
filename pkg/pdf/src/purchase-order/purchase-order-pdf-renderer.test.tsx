import { DateIso, DateOnlyIso, PurchaseOrderCode, type PurchaseOrderPdfModel } from '@pkg/schema';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, test } from 'vitest';

import { PurchaseOrderPdf } from './PurchaseOrderPdf.js';

describe('Purchase Order PDF', () => {
  test('prints the order details without exposing prices', () => {
    const text = collectText(PurchaseOrderPdf({ document: model() }));

    expect(text).toEqual(
      expect.arrayContaining([
        'PURCHASE ORDER',
        'PO-00042',
        'Acme Supplies',
        'JOB-00007, JOB-00012',
        '20 August 2026',
        'P-100 - Hydraulic pipe',
        '2 x 6000 mm',
        'Please quote PO-00042 on correspondence and invoices.',
      ]),
    );
    expect(text.join(' ')).not.toMatch(/Unit price|Subtotal|Total|R 900\.00|R 1 800\.00|South African rand/);
  });

  test('prints Jedidiah business details beside the order number', () => {
    const text = collectText(PurchaseOrderPdf({ document: model() }));

    expect(text).toEqual(
      expect.arrayContaining([
        'Jedidiah Equipment Pty Ltd',
        'VAT registration: 4420294821',
        'Company registration: C/K 2019/513612/07',
        'Address: Stoneybrook Farm, Kokstad, 4700',
        'Email: Jed@jedidiahequipment.co.za',
        'Cell: 082 419 4464',
      ]),
    );
  });

  test('prints the revision number so the Supplier knows which page supersedes which', () => {
    const text = collectText(PurchaseOrderPdf({ document: model({ revision: 3 }) }));

    expect(text).toEqual(expect.arrayContaining(['PO-00042 REV 3', 'Revision 3 - supersedes all earlier revisions']));
    // Revision 1 is the order as sent, so it says nothing about superseding anything.
    expect(collectText(PurchaseOrderPdf({ document: model() }))).toEqual(expect.arrayContaining(['PO-00042']));
  });

  test('prints who last modified the order and when', () => {
    const text = collectText(PurchaseOrderPdf({ document: model() }));

    expect(text).toContain('Last modified by Priya Buyer on 5 August 2026');
  });

  test('names a missing audit actor System', () => {
    const text = collectText(
      PurchaseOrderPdf({ document: model({ lastModified: { actorName: null, occurredAt: model().issueDate } }) }),
    );

    expect(text).toContain('Last modified by System on 2 August 2026');
  });
});

function model(overrides: Partial<PurchaseOrderPdfModel> = {}): PurchaseOrderPdfModel {
  return {
    code: PurchaseOrderCode.parse(42),
    expectedDeliveryDate: DateOnlyIso.parse('2026-08-20'),
    issueDate: DateIso.parse('2026-08-02T12:00:00.000Z'),
    jobCodes: ['JOB-00007', 'JOB-00012'].map((code) => modelJobCode(code)),
    lastModified: {
      actorName: 'Priya Buyer',
      occurredAt: DateIso.parse('2026-08-05T12:00:00.000Z'),
    },
    lines: [
      {
        partCode: 'P-100',
        partId: '00000000-0000-4000-8000-000000000001',
        partName: 'Hydraulic pipe',
        quantity: 2,
        standardPurchaseLengthMm: 6_000,
        supplierCode: 'AC-100',
        unitOfMeasure: 'mm',
        unitPrice: 900,
      },
    ],
    supplier: {
      address: '14 Foundry Road\nJohannesburg',
      companyName: 'Acme Supplies',
      contactPerson: 'Sam Buyer',
      email: 'orders@acme.example',
      id: '00000000-0000-4000-8000-000000000002',
      phone: '011 555 0100',
    },
    revision: 1,
    ...overrides,
  };
}

function modelJobCode(code: string): PurchaseOrderPdfModel['jobCodes'][number] {
  return code as PurchaseOrderPdfModel['jobCodes'][number];
}

type RenderedElement = ReactElement<{ children?: ReactNode }>;

function collectText(node: ReactNode): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectText);
  if (!isValidElement(node)) return [];
  const element = node as RenderedElement;
  if (typeof element.type === 'function') {
    return collectText((element.type as (props: typeof element.props) => ReactNode)(element.props));
  }
  return collectText(element.props.children);
}
