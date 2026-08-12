import type { QuoteDocumentModel } from '@pkg/schema';
import { Page, renderToBuffer, Text } from '@react-pdf/renderer';
import { cloneElement, createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, test } from 'vitest';

import { getSalesContactLine } from './QuoteDocumentHeader.js';
import { QuoteDocumentPdf } from './QuoteDocumentPdf.js';
import { QuoteDocumentPricingTable } from './QuoteDocumentPricingTable.js';

describe('renderQuoteDocumentPdf', () => {
  test('renders each Work Item with its Parts nested underneath', () => {
    const document: QuoteDocumentModel = {
      ...testQuoteDocument(),
      workItems: [
        {
          amount: 1_275,
          charges: [{ amount: 1_275, kind: 'labour', label: 'Labour', quantity: 1.5, unitPrice: 850 }],
          description: null,
          name: 'Labour-only rebuild',
        },
        {
          amount: 250,
          charges: [{ amount: 250, kind: 'part', label: 'Internal seal kit', quantity: 2, unitPrice: 125 }],
          description: null,
          name: 'Parts-only repair',
        },
        { amount: 0, charges: [], description: null, name: 'Included inspection' },
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
    expect(renderedText.filter((value) => value === 'R 1 275.00')).toHaveLength(1);
    expect(renderedText.filter((value) => value === 'R 250.00')).toHaveLength(1);
    expect(renderedText).toContain('R 0.00');
  });

  test('prices the charges beneath a Work Item rather than the Work Item heading', () => {
    const document: QuoteDocumentModel = {
      ...testQuoteDocument(),
      workItems: [
        {
          amount: 1_525,
          charges: [
            { amount: 1_275, kind: 'labour', label: 'Labour', quantity: 1.5, unitPrice: 850 },
            { amount: 250, kind: 'part', label: 'Internal seal kit', quantity: 2, unitPrice: 125 },
          ],
          description: null,
          name: 'Hydraulic rebuild',
        },
      ],
    };
    const renderedText = collectRenderedText(QuoteDocumentPricingTable({ document }));

    expect(renderedText).not.toContain('R 1 525.00');
    expect(renderedText.filter((value) => value === 'R 1 275.00')).toHaveLength(1);
    expect(renderedText.filter((value) => value === 'R 250.00')).toHaveLength(1);
  });

  test('keeps the amount on a Work Item that has no charges beneath it', () => {
    const document: QuoteDocumentModel = {
      ...testQuoteDocument(),
      workItems: [{ amount: 2_500, charges: [], description: null, name: 'Sundries' }],
    };
    const renderedText = collectRenderedText(QuoteDocumentPricingTable({ document }));

    expect(renderedText.filter((value) => value === 'R 2 500.00')).toHaveLength(1);
  });

  test('prints what the charges beneath a Work Item leave unaccounted for on its heading', () => {
    // An Other Work Item carries a flat amount rather than labour, so its own money never becomes a
    // charge. The heading prints that flat amount, leaving every figure on the page summable.
    const document: QuoteDocumentModel = {
      ...testQuoteDocument(),
      workItems: [
        {
          amount: 2_750,
          charges: [{ amount: 250, kind: 'part', label: 'Internal seal kit', quantity: 2, unitPrice: 125 }],
          description: null,
          name: 'Sundries',
        },
      ],
    };
    const renderedText = collectRenderedText(QuoteDocumentPricingTable({ document }));

    expect(renderedText).not.toContain('R 2 750.00');
    expect(renderedText.filter((value) => value === 'R 2 500.00')).toHaveLength(1);
    expect(renderedText.filter((value) => value === 'R 250.00')).toHaveLength(1);
  });

  test('prints a remainder of a single cent rather than rounding it away', () => {
    const document: QuoteDocumentModel = {
      ...testQuoteDocument(),
      workItems: [
        {
          amount: 250.01,
          charges: [{ amount: 250, kind: 'part', label: 'Internal seal kit', quantity: 2, unitPrice: 125 }],
          description: null,
          name: 'Sundries',
        },
      ],
    };
    const renderedText = collectRenderedText(QuoteDocumentPricingTable({ document }));

    expect(renderedText.filter((value) => value === 'R 0.01')).toHaveLength(1);
  });

  test('prints a Work Item description on its own line beneath the name', () => {
    const document: QuoteDocumentModel = {
      ...testQuoteDocument(),
      workItems: [
        {
          amount: 30_800,
          charges: [{ amount: 30_800, kind: 'labour', label: 'Labour', quantity: 56, unitPrice: 550 }],
          description: 'Remove, supply and weld on new parts',
          name: 'Fabrication',
        },
        { amount: 2_500, charges: [], description: null, name: 'Sundries' },
      ],
    };
    const renderedText = collectRenderedText(QuoteDocumentPricingTable({ document }));

    expect(renderedText.indexOf('Remove, supply and weld on new parts')).toBeGreaterThan(
      renderedText.indexOf('Fabrication'),
    );
    expect(renderedText.indexOf('Remove, supply and weld on new parts')).toBeLessThan(renderedText.indexOf('Labour'));
    expect(renderedText).toContain('R 550.00');
    expect(renderedText.filter((value) => value === 'Sundries')).toHaveLength(1);
  });

  test('repeats the column headings on every page the pricing table spans, and only those', async () => {
    const document: QuoteDocumentModel = {
      ...testQuoteDocument(),
      workItems: Array.from({ length: 22 }, (_, index) => ({
        amount: 850,
        charges: [{ amount: 850, kind: 'labour' as const, label: 'Labour', quantity: 1, unitPrice: 850 }],
        description: null,
        name: `Workshop ${index + 1}`,
      })),
    };
    const pages = await renderPageText(document, true);

    expect(pages.length).toBeGreaterThan(1);
    expect(pages.some((pageText) => !pageText.some((value) => value.startsWith('Workshop ')))).toBe(true);
    for (const pageText of pages) {
      const carriesPricingRows = pageText.some((value) => value.startsWith('Workshop '));
      expect(pageText.filter((value) => value === 'Description')).toHaveLength(carriesPricingRows ? 1 : 0);
    }
  });

  test('keeps the logo at its declared size when the sales contact exceeds one line', async () => {
    const document: QuoteDocumentModel = {
      ...testQuoteDocument(),
      salesPerson: {
        email: `${'quotations-'.repeat(7)}@jedidiah-equipment.co.za`,
        name: 'Dean van Niekerk',
        phoneNumber: '+27821234567',
      },
    };
    const layout = await renderLayout(document);
    const logo = findLayoutNode(layout, (node) => node.type === 'IMAGE');

    expect(logo?.box).toMatchObject({ height: 34, width: 132 });
  });
});

type RenderedElement = ReactElement<{ children?: ReactNode; fixed?: boolean; style?: unknown; wrap?: boolean }>;

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

type LayoutNode = {
  box?: { height: number; left: number; top: number; width: number };
  children?: LayoutNode[];
  type: string;
  value?: string;
};

/**
 * Paginates a document the way the renderer does and reports the text laid out on each page, so a
 * test can assert on what a reader sees per page rather than on the layout props that get it there.
 */
async function renderPageText(document: QuoteDocumentModel, appendTextOnlyPage = false): Promise<string[][]> {
  const layout = await renderLayout(document, appendTextOnlyPage);
  return (layout.children ?? []).map(collectLayoutText);
}

async function renderLayout(document: QuoteDocumentModel, appendTextOnlyPage = false): Promise<LayoutNode> {
  let layout: LayoutNode | undefined;
  const onRender = ({ _INTERNAL__LAYOUT__DATA_ }: { _INTERNAL__LAYOUT__DATA_: LayoutNode }) => {
    layout = _INTERNAL__LAYOUT__DATA_;
  };

  const pdf = QuoteDocumentPdf({ document });
  const pages = appendTextOnlyPage
    ? [pdf.props.children, createElement(Page, { key: 'appendix' }, createElement(Text, null, 'Appendix'))]
    : pdf.props.children;

  await renderToBuffer(cloneElement(pdf, { onRender } as never, pages));

  if (!layout) throw new Error('React-PDF did not return layout data');
  return layout;
}

function collectLayoutText(node: LayoutNode): string[] {
  if (node.type === 'TEXT_INSTANCE') return node.value === undefined ? [] : [node.value];

  return (node.children ?? []).flatMap(collectLayoutText);
}

function findLayoutNode(node: LayoutNode, matches: (candidate: LayoutNode) => boolean): LayoutNode | null {
  if (matches(node)) return node;

  for (const child of node.children ?? []) {
    const match = findLayoutNode(child, matches);
    if (match) return match;
  }

  return null;
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
