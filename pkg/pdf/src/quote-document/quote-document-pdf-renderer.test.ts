import type { QuoteDocumentModel } from '@pkg/schema';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, test } from 'vitest';

import { getSalesContactLine } from './QuoteDocumentHeader.js';
import { QuoteDocumentPricingTable } from './QuoteDocumentPricingTable.js';
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

  test('renders each Work Item with its Parts nested underneath', () => {
    const document: QuoteDocumentModel = {
      ...testQuoteDocument(),
      workItems: [
        {
          amount: 1_275,
          charges: [{ amount: 1_275, kind: 'labour', label: 'Labour', quantity: 1.5, unitPrice: 850 }],
          name: 'Labour-only rebuild',
        },
        {
          amount: 250,
          charges: [{ amount: 250, kind: 'part', label: 'Internal seal kit', quantity: 2, unitPrice: 125 }],
          name: 'Parts-only repair',
        },
        { amount: 0, charges: [], name: 'Included inspection' },
      ],
    };
    const renderedText = collectRenderedText(QuoteDocumentPricingTable({ document }));

    expect(renderedText.filter((value) => value === 'Labour-only rebuild')).toHaveLength(1);
    expect(renderedText.filter((value) => value === 'Parts-only repair')).toHaveLength(1);
    expect(renderedText.filter((value) => value === 'Included inspection')).toHaveLength(1);
    expect(renderedText.filter((value) => value === 'Labour')).toHaveLength(1);
    expect(renderedText.indexOf('Labour')).toBeGreaterThan(renderedText.indexOf('Labour-only rebuild'));
    expect(renderedText.filter((value) => value === 'Internal seal kit')).toHaveLength(1);
    expect(renderedText.indexOf('Internal seal kit')).toBeGreaterThan(renderedText.indexOf('Parts-only repair'));
    expect(renderedText).toContain('1.5');
    expect(renderedText).toContain('R 850.00');
    expect(renderedText).toContain('2');
    expect(renderedText).toContain('R 125.00');
    expect(renderedText).toContain('R 1 275.00');
    expect(renderedText.filter((value) => value === 'R 250.00')).toHaveLength(2);
    expect(renderedText).toContain('R 0.00');
  });

  test('places Quantity after Description and right-aligns quantity text', () => {
    const rendered = QuoteDocumentPricingTable({ document: testQuoteDocument() });
    const renderedText = collectRenderedText(rendered);
    const quantityHeader = findRenderedTextElement(rendered, 'Qty');
    const quantityCell = findRenderedTextElement(rendered, '1');

    expect(renderedText.slice(0, 4)).toEqual(['Description', 'Qty', 'Unit Price', 'Subtotal']);
    expect(flattenStyle(quantityHeader?.props.style)).toMatchObject({ textAlign: 'right' });
    expect(flattenStyle(quantityCell?.props.style)).toMatchObject({ textAlign: 'right' });
  });

  test('keeps each Work Item heading with its first breakdown row across page breaks', () => {
    const document: QuoteDocumentModel = {
      ...testQuoteDocument(),
      workItems: [
        {
          amount: 1_275,
          charges: [{ amount: 1_275, kind: 'labour', label: 'Labour', quantity: 1.5, unitPrice: 850 }],
          name: 'Labour-only rebuild',
        },
        {
          amount: 250,
          charges: [{ amount: 250, kind: 'part', label: 'Internal seal kit', quantity: 2, unitPrice: 125 }],
          name: 'Parts-only repair',
        },
      ],
    };
    const rendered = QuoteDocumentPricingTable({ document });

    expect(findUnbreakableGroup(rendered, ['Labour-only rebuild', 'Labour'])).not.toBeNull();
    expect(findUnbreakableGroup(rendered, ['Parts-only repair', 'Internal seal kit'])).not.toBeNull();
  });
});

type RenderedElement = ReactElement<{ children?: ReactNode; style?: unknown; wrap?: boolean }>;

/**
 * Walks a rendered tree in document order, invoking function components as it goes so callers see
 * only the @react-pdf primitives and the text they hold.
 */
function* walkRendered(node: ReactNode): Generator<RenderedElement | string> {
  if (node === null || node === undefined || typeof node === 'boolean') return;
  if (typeof node === 'string' || typeof node === 'number') {
    yield String(node);
    return;
  }
  if (Array.isArray(node)) {
    for (const child of node) yield* walkRendered(child);
    return;
  }
  if (!isValidElement(node)) return;
  const element = node as RenderedElement;

  if (typeof element.type === 'function') {
    yield* walkRendered((element.type as (props: typeof element.props) => ReactNode)(element.props));
    return;
  }

  yield element;
  yield* walkRendered(element.props.children);
}

function collectRenderedText(node: ReactNode): string[] {
  return [...walkRendered(node)].filter((rendered) => typeof rendered === 'string');
}

function findRenderedTextElement(node: ReactNode, text: string): RenderedElement | null {
  for (const rendered of walkRendered(node)) {
    if (typeof rendered === 'string') continue;
    if (collectRenderedText(rendered.props.children).join('') === text) return rendered;
  }

  return null;
}

function findUnbreakableGroup(node: ReactNode, expectedText: string[]): RenderedElement | null {
  for (const rendered of walkRendered(node)) {
    if (typeof rendered === 'string' || rendered.props.wrap !== false) continue;
    const renderedText = collectRenderedText(rendered.props.children);
    if (expectedText.every((text) => renderedText.includes(text))) return rendered;
  }

  return null;
}

function flattenStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flattenStyle));
  return style && typeof style === 'object' ? (style as Record<string, unknown>) : {};
}

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
    pricingRows: [
      {
        amount: 595_000,
        descriptionLines: ['SG1836 Silage Grain 18 36'],
        kind: 'base',
        quantity: 1,
        unitPrice: 595_000,
      },
      {
        amount: 5_000,
        descriptionLines: ['2 Side Working Lights'],
        kind: 'optional',
        quantity: 1,
        unitPrice: 5_000,
      },
      {
        amount: 15_000,
        descriptionLines: ['BKT Tyres'],
        kind: 'optional',
        quantity: 1,
        unitPrice: 15_000,
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
    transport: 'Included in sale price',
    vatAmount: 92_250,
    workItems: [],
  };
}
