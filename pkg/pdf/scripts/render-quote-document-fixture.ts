import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { QuoteDocumentModel } from '@pkg/schema';

import { renderQuoteDocumentPdf } from '../src/quote-document/quote-document-pdf-renderer.js';

const outputDirectory = resolve(process.cwd(), '../../tmp/pdfs');
const outputPath = resolve(outputDirectory, 'quote-document-fixture.pdf');
const document: QuoteDocumentModel = {
  currencyCode: 'ZAR',
  customer: {
    address: '14 Silo Road, Bothaville, Free State, 9660',
    companyName: 'Cedar Valley Farming (Pty) Ltd',
    contactPerson: 'Grace Todd',
    email: 'grace@cedarvalley.example.co.za',
    phone: '+27 (0) 82 555 0142',
    vatNumber: '4870293814',
  },
  issueDate: new Date('2026-08-06T00:00:00.000Z'),
  leadTime: '8 working weeks',
  notes: ['Quotation valid for 30 days from issue date.'],
  paymentTerms: '20% deposit',
  pricingRows: [
    {
      amount: 275_000,
      descriptionLines: ['GG812 Gravel 8 Ton'],
      kind: 'base',
      quantity: 1,
      unitPrice: 275_000,
    },
    {
      amount: 12_500,
      descriptionLines: ['Hydraulic tailgate kit'],
      kind: 'optional',
      quantity: 1,
      unitPrice: 12_500,
    },
    {
      amount: 8_900,
      descriptionLines: ['LED road-light package'],
      kind: 'optional',
      quantity: 1,
      unitPrice: 8_900,
    },
    {
      amount: 18_500,
      descriptionLines: ['Heavy-duty tyre upgrade'],
      kind: 'optional',
      quantity: 1,
      unitPrice: 18_500,
    },
    {
      amount: -13_750,
      descriptionLines: ['Discount (5%)'],
      kind: 'discount',
      quantity: 1,
      unitPrice: -13_750,
    },
  ],
  quoteCode: 'QUO-00047',
  salesPerson: {
    email: 'sales@jedidiah.co.za',
    name: 'Jed van Niekerk',
    phoneNumber: '+27821234567',
  },
  staleSelectionNotes: [],
  subtotal: 305_200,
  total: 350_980,
  transport: 'Included in sale price',
  vatAmount: 45_780,
  workItems: [
    {
      amount: 2_250,
      charges: [{ amount: 2_250, kind: 'labour', label: 'Labour', quantity: 3, unitPrice: 750 }],
      description: 'Fit optional hydraulic kit before delivery',
      name: 'Pre-delivery fitment',
    },
    {
      amount: 1_800,
      charges: [{ amount: 1_800, kind: 'part', label: 'Hydraulic coupler set', quantity: 1, unitPrice: 1_800 }],
      description: null,
      name: 'Workshop materials',
    },
  ],
};

await mkdir(outputDirectory, { recursive: true });
await writeFile(outputPath, await renderQuoteDocumentPdf({ document, filename: 'QUO-00047.pdf' }));
console.log(outputPath);
