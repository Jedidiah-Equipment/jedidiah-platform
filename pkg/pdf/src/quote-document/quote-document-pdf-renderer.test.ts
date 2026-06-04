import type { QuoteDocumentModel } from '@pkg/schema';
import { describe, expect, test } from 'vitest';

import { getSalesContactLine } from './QuoteDocumentHeader.js';
import { renderQuoteDocumentPdf } from './quote-document-pdf-renderer.js';

describe('renderQuoteDocumentPdf', () => {
  test('renders a quote document model to PDF bytes', async () => {
    const bytes = await renderQuoteDocumentPdf({
      document: testQuoteDocument(),
      filename: 'QUO-00003-rev-1.pdf',
    });

    expect(bytes.byteLength).toBeGreaterThan(1_000);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
  });
});

describe('getSalesContactLine', () => {
  test('omits the phone number when the sales user has no phone number', () => {
    expect(
      getSalesContactLine({
        ...testQuoteDocument(),
        salesPerson: {
          email: 'dean@example.com',
          name: 'Dean van Niekerk',
          phoneNumber: null,
        },
      }),
    ).toBe('Email: dean@example.com');
  });

  test('omits the contact line when no sales contact details exist', () => {
    expect(
      getSalesContactLine({
        ...testQuoteDocument(),
        salesPerson: null,
      }),
    ).toBeNull();
  });
});

function testQuoteDocument(): QuoteDocumentModel {
  return {
    currencyCode: 'ZAR',
    customer: {
      address: 'Block C, Grain Logistics Park, 14 Silo Road, Bothaville, Free State, 9660',
      companyName: 'Nampo Agri Logistics (Pty) Ltd',
      contactPerson: 'John van der Merwe',
      email: 'john.vdm@nampoagri.example.co.za',
      phone: '+27 (0) 82 555 0142',
      vatNumber: '4870293814',
    },
    issueDate: new Date('2026-06-02T00:00:00.000Z'),
    leadTime: '21 working days',
    lineItems: [
      {
        amount: 595_000,
        descriptionLines: ['SG1836 Silage Grain 18 36'],
        kind: 'base',
        quantity: 1,
      },
      {
        amount: 5_000,
        descriptionLines: ['2 Side Working Lights'],
        kind: 'optional',
        quantity: 1,
      },
      {
        amount: 15_000,
        descriptionLines: ['BKT Tyres'],
        kind: 'optional',
        quantity: 1,
      },
    ],
    notes: ['Please confirm customer details before order processing.'],
    paymentTerms: '20% deposit',
    quoteCode: 'QUO-00003',
    salesPerson: {
      email: 'dean@example.com',
      name: 'Dean van Niekerk',
      phoneNumber: '+27821234567',
    },
    staleSelectionNotes: [],
    subtotal: 615_000,
    total: 707_250,
    transport: 'Excluded',
    vatAmount: 92_250,
  };
}
