import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { DateIso, DateOnlyIso } from '@pkg/schema';
import { JobCode, PurchaseOrderCode, type PurchaseOrderPdfModel } from '@pkg/schema/equipment';

import { renderPurchaseOrderPdf } from '../src/equipment/purchase-order/purchase-order-pdf-renderer.js';

const outputDirectory = resolve(process.cwd(), '../../tmp/pdfs');
const outputPath = resolve(outputDirectory, 'purchase-order-fixture.pdf');
const document: PurchaseOrderPdfModel = {
  code: PurchaseOrderCode.parse(42),
  expectedDeliveryDate: DateOnlyIso.parse('2026-08-20'),
  issueDate: DateIso.parse('2026-08-02T12:00:00.000Z'),
  jobCodes: [JobCode.parse(7), JobCode.parse(12)],
  lastModified: {
    actorName: 'Priya Buyer',
    occurredAt: DateIso.parse('2026-08-05T12:00:00.000Z'),
  },
  lines: [
    {
      description: 'Hydraulic pipe',
      id: '00000000-0000-4000-8000-000000000004',
      kind: 'part',
      partCode: 'PIPE-100',
      partId: '00000000-0000-4000-8000-000000000001',
      partName: 'Hydraulic pipe',
      quantity: 2,
      standardPurchaseLengthMm: 6_000,
      supplierCode: 'AC-PIPE-100',
      unit: null,
      unitOfMeasure: 'mm',
      unitPrice: 900,
    },
    {
      description: 'Sealed bearing set',
      id: '00000000-0000-4000-8000-000000000005',
      kind: 'part',
      partCode: 'BRG-220',
      partId: '00000000-0000-4000-8000-000000000002',
      partName: 'Sealed bearing set',
      quantity: 8,
      standardPurchaseLengthMm: null,
      supplierCode: 'AC-BRG-220',
      unit: null,
      unitOfMeasure: 'set',
      unitPrice: 245.75,
    },
    {
      description: 'Packing tape',
      id: '00000000-0000-4000-8000-000000000006',
      kind: 'custom',
      partCode: null,
      partId: null,
      partName: null,
      quantity: 2.5,
      standardPurchaseLengthMm: null,
      supplierCode: 'TAPE-5',
      unit: 'box',
      unitOfMeasure: null,
      unitPrice: 80,
    },
    {
      description: 'Workshop service',
      id: '00000000-0000-4000-8000-000000000007',
      kind: 'custom',
      partCode: null,
      partId: null,
      partName: null,
      quantity: 1,
      standardPurchaseLengthMm: null,
      unit: 'each',
      unitOfMeasure: null,
      unitPrice: 500,
    },
  ],
  supplier: {
    address: '14 Foundry Road\nIndustria\nJohannesburg, 2093',
    companyName: 'Acme Industrial Supplies (Pty) Ltd',
    contactPerson: 'Sam Buyer',
    email: 'orders@acme.example',
    id: '00000000-0000-4000-8000-000000000003',
    phone: '011 555 0100',
  },
};

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, await renderPurchaseOrderPdf({ document, filename: 'PO-00042.pdf' }));
console.log(outputPath);
