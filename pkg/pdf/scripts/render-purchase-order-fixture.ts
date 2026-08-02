import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { DateIso, DateOnlyIso, JobCode, PurchaseOrderCode, type PurchaseOrderPdfModel } from '@pkg/schema';

import { renderPurchaseOrderPdf } from '../src/purchase-order/purchase-order-pdf-renderer.js';

const outputDirectory = resolve(process.cwd(), '../../tmp/pdfs');
const outputPath = resolve(outputDirectory, 'purchase-order-fixture.pdf');
const document: PurchaseOrderPdfModel = {
  code: PurchaseOrderCode.parse(42),
  expectedDeliveryDate: DateOnlyIso.parse('2026-08-20'),
  issueDate: DateIso.parse('2026-08-02T12:00:00.000Z'),
  jobCodes: [JobCode.parse(7), JobCode.parse(12)],
  lines: [
    {
      partCode: 'PIPE-100',
      partId: '00000000-0000-4000-8000-000000000001',
      partName: 'Hydraulic pipe',
      quantity: 2,
      standardPurchaseLengthMm: 6_000,
      supplierCode: 'AC-PIPE-100',
      unitOfMeasure: 'mm',
      unitPrice: 900,
    },
    {
      partCode: 'BRG-220',
      partId: '00000000-0000-4000-8000-000000000002',
      partName: 'Sealed bearing set',
      quantity: 8,
      standardPurchaseLengthMm: null,
      supplierCode: 'AC-BRG-220',
      unitOfMeasure: 'set',
      unitPrice: 245.75,
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
