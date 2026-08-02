import { DateIso, DateOnlyIso, PurchaseOrderCode, type PurchaseOrderPdfModel } from '@pkg/schema';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, test } from 'vitest';

import { PurchaseOrderPdf } from './PurchaseOrderPdf.js';
import { renderPurchaseOrderPdf } from './purchase-order-pdf-renderer.js';

describe('Purchase Order PDF', () => {
  test('renders a valid PDF document', async () => {
    const bytes = await renderPurchaseOrderPdf({ document: model(), filename: 'PO-00042.pdf' });

    expect(bytes.byteLength).toBeGreaterThan(1_000);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
  });

  test('prints the PO number, linked Jobs, supplier, expected date, and line details', () => {
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
        'R 900.00',
        'R 1 800.00',
      ]),
    );
  });
});

function model(): PurchaseOrderPdfModel {
  return {
    code: PurchaseOrderCode.parse(42),
    expectedDeliveryDate: DateOnlyIso.parse('2026-08-20'),
    issueDate: DateIso.parse('2026-08-02T12:00:00.000Z'),
    jobCodes: ['JOB-00007', 'JOB-00012'].map((code) => modelJobCode(code)),
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
