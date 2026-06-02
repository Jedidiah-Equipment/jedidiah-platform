import type { customers, Db, products, quotes, user } from '@pkg/db';
import {
  computeQuoteTotal,
  JEDIDIAH_BRAND_YELLOW,
  JEDIDIAH_BRAND_YELLOW_ON_LIGHT,
  QUOTE_DOCUMENT_VAT_PERCENT,
  resolveEffectiveBom,
} from '@pkg/domain';
import { formatQuoteCode, type QuoteDocumentGenerationInput } from '@pkg/schema';

import { listAssemblies } from '../products/product-assembly-service.js';
import type { QuoteSelectedAssemblyRow } from './quote-selected-assemblies.js';

export type QuoteDocumentGenerationRow = typeof quotes.$inferSelect & {
  customer: Pick<
    typeof customers.$inferSelect,
    'address' | 'companyName' | 'contactPerson' | 'email' | 'phone' | 'vatNumber'
  >;
  product: Pick<typeof products.$inferSelect, 'buildTimeDays' | 'currencyCode' | 'modelCode' | 'name'>;
  salesPerson: Pick<typeof user.$inferSelect, 'email' | 'name'> | null;
  selectedAssemblies: QuoteSelectedAssemblyRow[];
};

export async function renderQuoteDocumentHtml({
  db,
  input,
  quote,
}: {
  db: Db;
  input: QuoteDocumentGenerationInput;
  quote: QuoteDocumentGenerationRow;
}): Promise<string> {
  const productAssemblies = await listAssemblies({ productId: quote.productId, tx: db });
  const effectiveBom = resolveEffectiveBom({
    catalogAssemblies: productAssemblies,
    selectedAssemblies: quote.selectedAssemblies,
  });
  const selectedOptionalAssemblies = effectiveBom.selectedOptionalAssemblies.map(({ selection }) => ({
    amount: selection.quotedPrice,
    label: selection.quotedName,
  }));
  const staleSelectionNotes = effectiveBom.staleSelections.map((selection) => `${selection.quotedName} unavailable`);
  const lineItems: QuoteDocumentLineItem[] = [
    {
      amount: quote.quotedBasePrice,
      descriptionLines: [
        `${quote.product.modelCode} ${quote.product.name}`.trim(),
        ...toDisplayLines(quote.documentNotes),
      ],
      kind: 'base',
      quantity: 1,
    },
    ...selectedOptionalAssemblies.map((item) => ({
      amount: item.amount,
      descriptionLines: [item.label],
      kind: 'optional' as const,
      quantity: 1,
    })),
    ...(quote.deliveryIncluded && quote.deliveryPrice > 0
      ? [
          {
            amount: quote.deliveryPrice,
            descriptionLines: ['Delivery'],
            kind: 'charge' as const,
            quantity: 1,
          },
        ]
      : []),
    ...(quote.discountAmount > 0
      ? [
          {
            amount: -quote.discountAmount,
            descriptionLines: ['Discount'],
            kind: 'discount' as const,
            quantity: 1,
          },
        ]
      : []),
  ];
  const subtotal = computeQuoteTotal({
    deliveryIncluded: quote.deliveryIncluded,
    deliveryPrice: quote.deliveryPrice,
    discountAmount: quote.discountAmount,
    quotedBasePrice: quote.quotedBasePrice,
    selectedAssemblyPrices: selectedOptionalAssemblies.map((item) => item.amount),
  });
  const vatAmount = roundMoney((subtotal * QUOTE_DOCUMENT_VAT_PERCENT) / 100);
  const total = roundMoney(subtotal + vatAmount);

  return renderQuoteDocumentTemplate({
    customer: quote.customer,
    issueDate: quote.createdAt,
    leadTime: input.leadTime,
    lineItems,
    paymentTerms: `${formatPercentValue(quote.depositPercent)} deposit`,
    quoteCode: formatQuoteCode(quote.code),
    salesPerson: quote.salesPerson,
    staleSelectionNotes,
    subtotal,
    total,
    transport: quote.deliveryIncluded
      ? `Included${quote.deliveryPrice > 0 ? ` (${formatPlainMoney(quote.deliveryPrice)})` : ''}`
      : 'Excluded',
    vatAmount,
  });
}

type QuoteDocumentLineItem = {
  amount: number;
  descriptionLines: string[];
  kind: 'base' | 'charge' | 'discount' | 'optional';
  quantity: number;
};

function renderQuoteDocumentTemplate({
  customer,
  issueDate,
  leadTime,
  lineItems,
  paymentTerms,
  quoteCode,
  salesPerson,
  staleSelectionNotes,
  subtotal,
  total,
  transport,
  vatAmount,
}: {
  customer: QuoteDocumentGenerationRow['customer'];
  issueDate: Date;
  leadTime: string;
  lineItems: QuoteDocumentLineItem[];
  paymentTerms: string;
  quoteCode: string;
  salesPerson: QuoteDocumentGenerationRow['salesPerson'];
  staleSelectionNotes: string[];
  subtotal: number;
  total: number;
  transport: string;
  vatAmount: number;
}): string {
  const baseItem = lineItems.find((item) => item.kind === 'base') ?? lineItems[0];
  const optionalItems = lineItems.filter((item) => item.kind === 'optional');
  const adjustmentItems = lineItems.filter((item) => item.kind === 'charge' || item.kind === 'discount');
  const customerLine =
    [customer.companyName, customer.contactPerson].flatMap((value) => toDisplayLines(value))[0] ?? '';
  const customerDetailRows = renderDetailRows([
    { label: 'Company', value: customer.companyName },
    { label: 'Contact', value: customer.contactPerson },
    { label: 'Email', value: customer.email },
    { label: 'Phone', value: customer.phone },
    { label: 'VAT No.', value: customer.vatNumber },
    { label: 'Address', value: toDisplayLines(customer.address).join(', '), wide: true },
  ]);
  const salespersonLine = [salesPerson?.name, salesPerson?.email].flatMap((value) => toDisplayLines(value)).join(' / ');
  const staleSelectionHtml = staleSelectionNotes
    .map((note) => `<div class="notice-line">${escapeHtml(note)}</div>`)
    .join('');
  const itemCount = lineItems.length;
  const optionalRowsHtml =
    optionalItems.length > 0
      ? `<tr class="section-row">
              <td class="qty-col"></td>
              <td>OPTIONAL EXTRAS</td>
              <td class="price-col"></td>
              <td class="subtotal-col"></td>
            </tr>
            ${optionalItems.map((item) => renderQuoteDocumentLineItemRow(item)).join('')}`
      : '';
  const adjustmentRowsHtml = adjustmentItems.map((item) => renderQuoteDocumentLineItemRow(item)).join('');
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(quoteCode)}</title>
    <style>
      @page {
        margin: 10mm;
        size: A4;
      }

      * {
        box-sizing: border-box;
      }

      body {
        background: #fff;
        color: #171717;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 10.5px;
        line-height: 1.35;
        margin: 0;
      }

      .sheet {
        display: flex;
        flex-direction: column;
        min-height: 277mm;
        position: relative;
      }

      .top-bar {
        align-items: stretch;
        display: grid;
        grid-template-columns: 1fr 63mm;
        min-height: 41mm;
      }

      .brand-panel {
        background: #151515;
        border-radius: 3mm 0 0 3mm;
        color: #fff;
        padding: 5mm 6mm;
        position: relative;
      }

      .brand-panel:after {
        background: ${JEDIDIAH_BRAND_YELLOW};
        bottom: 0;
        content: '';
        height: 1.4mm;
        left: 0;
        position: absolute;
        right: 0;
      }

      .logo-frame {
        height: 15.6mm;
        margin: 0 0 3mm 0;
        overflow: hidden;
        width: 56mm;
      }

      .logo {
        display: block;
        height: auto;
        margin: -0.35mm 0 0 -0.35mm;
        width: 57mm;
      }

      .tagline {
        color: ${JEDIDIAH_BRAND_YELLOW};
        font-size: 10px;
        font-style: italic;
        font-weight: 800;
        text-transform: uppercase;
      }

      .brand-contact {
        color: #d7d7d7;
        display: grid;
        font-size: 9.3px;
        gap: 0.8mm;
        margin-top: 3mm;
      }

      .document-panel {
        background: ${JEDIDIAH_BRAND_YELLOW};
        border-radius: 0 3mm 3mm 0;
        color: #141414;
        padding: 5mm;
        text-align: right;
      }

      .document-panel h1 {
        font-size: 24px;
        font-weight: 800;
        line-height: 1;
        margin: 0 0 3mm;
        text-transform: uppercase;
      }

      .document-panel .doc-code {
        font-size: 15px;
        font-weight: 800;
      }

      .document-panel .meta {
        display: grid;
        font-size: 9.4px;
        gap: 0.8mm;
        margin-top: 4mm;
      }

      .document-panel .label {
        display: block;
        font-size: 7.5px;
        font-weight: 800;
        text-transform: uppercase;
      }

      .info-grid {
        display: grid;
        gap: 3.5mm;
        grid-template-columns: 1fr 58mm;
        margin-top: 5mm;
      }

      .info-panel {
        border-radius: 2.5mm;
        box-shadow: inset 0 0 0 0.35mm #171717;
        min-height: 39mm;
        padding: 3.5mm;
      }

      .info-panel.dark {
        background: #171717;
        color: #fff;
      }

      .eyebrow {
        color: #696969;
        font-size: 7.8px;
        font-weight: 800;
        margin-bottom: 2.3mm;
        text-transform: uppercase;
      }

      .dark .eyebrow {
        color: ${JEDIDIAH_BRAND_YELLOW};
      }

      .panel-title {
        font-size: 13px;
        font-weight: 800;
        margin-bottom: 1.8mm;
      }

      .muted-line {
        color: #555;
        margin-top: 0.8mm;
      }

      .dark .muted-line {
        color: #d9d9d9;
      }

      .detail-row {
        border-bottom: 0.25mm solid #e4e4e4;
        display: grid;
        gap: 1mm;
        grid-template-columns: 25mm 1fr;
        min-height: 5.3mm;
        padding: 1.1mm 0;
      }

      .detail-row span {
        color: #333;
        font-size: 8px;
        font-weight: 800;
      }

      .detail-row strong {
        font-weight: 700;
        overflow-wrap: anywhere;
      }

      .detail-row:last-child {
        border-bottom: 0;
      }

      .detail-row.wide {
        gap: 0.8mm;
        grid-template-columns: 1fr;
      }

      .quote-strip {
        align-items: center;
        background: #f7f7f7;
        border-left: 1.6mm solid ${JEDIDIAH_BRAND_YELLOW};
        border-radius: 2mm;
        display: grid;
        gap: 4mm;
        grid-template-columns: 1fr 25mm 35mm;
        margin-top: 4mm;
        padding: 3.4mm 4mm;
      }

      .quote-strip .primary {
        font-size: 14px;
        font-weight: 800;
        line-height: 1.15;
        text-transform: uppercase;
      }

      .quote-strip .caption {
        color: #6a6a6a;
        display: block;
        font-size: 7.5px;
        font-weight: 800;
        margin-bottom: 0.7mm;
        text-transform: uppercase;
      }

      .quote-strip .value {
        font-size: 10.5px;
        font-weight: 800;
      }

      .document-table-frame {
        border: 0.35mm solid #171717;
        margin-top: 4.5mm;
        position: relative;
      }

      .document-table {
        border-collapse: separate;
        border-spacing: 0;
        position: relative;
        table-layout: fixed;
        width: 100%;
        z-index: 1;
      }

      .document-table-right-stroke {
        background: #171717;
        bottom: 0;
        position: absolute;
        right: 0;
        top: 0;
        width: 0.35mm;
        z-index: 3;
      }

      .document-table th,
      .document-table td {
        border-bottom: 0.25mm solid #dedede;
        border-right: 0.25mm solid #dedede;
        padding: 2.2mm 2.6mm;
        vertical-align: top;
      }

      .document-table th {
        background: #171717;
        border-bottom: 0.35mm solid #171717;
        border-right-color: #4a4a4a;
        color: #fff;
        font-size: 8.5px;
        font-weight: 800;
        line-height: 1;
        text-transform: uppercase;
      }

      .document-table th:last-child,
      .document-table td:last-child {
        border-right: 0;
      }

      .qty-col {
        text-align: center;
        width: 12.5mm;
      }

      .description-col {
        width: auto;
      }

      .price-col {
        text-align: right;
        width: 29mm;
      }

      .subtotal-col {
        text-align: right;
        width: 32mm;
      }

      .document-table tbody tr:last-child td {
        border-bottom: 0;
      }

      .price-cell {
        background: ${JEDIDIAH_BRAND_YELLOW_ON_LIGHT};
        font-weight: 800;
        text-align: right;
        white-space: nowrap;
      }

      .description {
        font-size: 10.8px;
        line-height: 1.42;
        white-space: pre-line;
      }

      .section-row td {
        background: #f7f7f7;
        color: #333;
        font-size: 8.5px;
        font-weight: 800;
        letter-spacing: 0;
        padding: 2mm 2.6mm;
        text-transform: uppercase;
      }

      .item-row:nth-child(even) td:not(.price-cell) {
        background: #fcfcfc;
      }

      .item-row td {
        font-size: 10.5px;
      }

      .product-row .description {
        font-size: 11.5px;
        font-weight: 800;
      }

      .notice-row td {
        background: #fff8e5;
        color: #5f4300;
        font-size: 8.8px;
      }

      .notice-line + .notice-line {
        margin-top: 1mm;
      }

      .bottom-grid {
        align-items: start;
        display: grid;
        gap: 4mm;
        grid-template-columns: 1fr 60mm;
        margin-top: auto;
        padding-top: 5mm;
      }

      .terms {
        border-top: 0.5mm solid #171717;
        display: grid;
        gap: 1.7mm;
        padding-top: 3mm;
      }

      .terms-row {
        display: grid;
        grid-template-columns: 28mm 1fr;
      }

      .terms-row span {
        font-weight: 800;
        text-transform: uppercase;
      }

      .summary-box {
        border-radius: 2mm;
        overflow: hidden;
        position: relative;
      }

      .summary-box:after {
        border: 0.35mm solid #171717;
        border-radius: 2mm;
        content: '';
        inset: 0;
        pointer-events: none;
        position: absolute;
        z-index: 2;
      }

      .summary-right-stroke {
        background: #171717;
        border-radius: 0 2mm 2mm 0;
        bottom: 0;
        position: absolute;
        right: 0;
        top: 0;
        width: 0.35mm;
        z-index: 3;
      }

      .summary-row {
        display: grid;
        grid-template-columns: 1fr 30mm;
        position: relative;
        z-index: 1;
      }

      .summary-row div {
        border-bottom: 0.25mm solid #dedede;
        padding: 2.4mm 3mm;
      }

      .summary-row .amount {
        background: ${JEDIDIAH_BRAND_YELLOW_ON_LIGHT};
        font-weight: 800;
        text-align: right;
      }

      .summary-row.total div {
        background: #171717;
        border-bottom: 0;
        color: #fff;
        font-size: 12px;
        font-weight: 800;
      }

      .summary-row.total .amount {
        color: ${JEDIDIAH_BRAND_YELLOW};
        font-size: 14px;
      }

      .footer-note {
        border-top: 0.25mm solid #e2e2e2;
        color: #777;
        font-size: 8px;
        margin-top: 4mm;
        padding-top: 2mm;
      }
    </style>
  </head>
  <body>
    <main class="sheet">
      <section class="top-bar">
        <div class="brand-panel">
          <div class="logo-frame">
            <img alt="Jedidiah Equipment" class="logo" src="${JEDIDIAH_LOGO_DATA_URI}">
          </div>
          <div class="tagline">Built for high productivity &amp; reliability</div>
          <div class="brand-contact">
            <div>Jedidiah Equipment</div>
            <div>Stoneybrook Farm, Kokstad, 4700</div>
            <div>Email: jed@jedidiahequipment.co.za | Cell: +27 (0) 082 419 4464</div>
            <div>C/K 2019/513612/07 | VAT No. 4420294821</div>
          </div>
        </div>
        <div class="document-panel">
          <h1>Quotation</h1>
          <div class="doc-code">${escapeHtml(quoteCode)}</div>
          <div class="meta">
            <div><span class="label">Quote date</span>${formatDateOnly(issueDate)}</div>
            <div><span class="label">Prepared by</span>${escapeHtml(salesPerson?.name ?? 'Jedidiah Equipment')}</div>
          </div>
        </div>
      </section>

      <section class="info-grid">
        <div class="info-panel">
          <div class="eyebrow">Customer details</div>
          <div class="panel-title">${escapeHtml(customerLine)}</div>
          ${customerDetailRows}
        </div>
        <div class="info-panel dark">
          <div class="eyebrow">Banking details</div>
          <div class="panel-title">FNB</div>
          <div class="muted-line">Acc no: 62835496599</div>
          <div class="muted-line">Branch: 220-122</div>
          <div class="muted-line">Reference: ${escapeHtml(quoteCode)}</div>
        </div>
      </section>

      <section class="quote-strip">
        <div>
          <span class="caption">Primary equipment</span>
          <div class="primary">${baseItem ? escapeHtml(baseItem.descriptionLines[0]?.toUpperCase() ?? '') : ''}</div>
        </div>
        <div>
          <span class="caption">Items</span>
          <div class="value">${itemCount}</div>
        </div>
        <div>
          <span class="caption">Lead time</span>
          <div class="value">${escapeHtml(leadTime)}</div>
        </div>
      </section>

      <div class="document-table-frame">
        <table class="document-table">
          <thead>
            <tr>
              <th class="qty-col">Qty</th>
              <th class="description-col">Description</th>
              <th class="price-col">Unit price</th>
              <th class="subtotal-col">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            ${baseItem ? renderQuoteDocumentLineItemRow(baseItem, 'product-row') : ''}
            ${optionalRowsHtml}
            ${adjustmentRowsHtml}
            ${
              staleSelectionHtml
                ? `<tr class="notice-row">
                    <td class="qty-col"></td>
                    <td>${staleSelectionHtml}</td>
                    <td class="price-col"></td>
                    <td class="subtotal-col"></td>
                  </tr>`
                : ''
            }
          </tbody>
        </table>
        <div class="document-table-right-stroke"></div>
      </div>

      <section class="bottom-grid">
        <div class="terms">
          <div class="terms-row"><span>Payment Terms:</span><strong>${escapeHtml(paymentTerms)}</strong></div>
          <div class="terms-row"><span>Transport:</span><strong>${escapeHtml(transport)}</strong></div>
          <div class="terms-row"><span>Lead Time:</span><strong>${escapeHtml(leadTime)}</strong></div>
        </div>
        <div class="summary-box">
          <div class="summary-row"><div>Subtotal</div><div class="amount">${formatPlainMoney(subtotal)}</div></div>
          <div class="summary-row"><div>VAT</div><div class="amount">${formatPlainMoney(vatAmount)}</div></div>
          <div class="summary-row total"><div>Total</div><div class="amount">${formatPlainMoney(total)}</div></div>
          <div class="summary-right-stroke"></div>
        </div>
      </section>

      <div class="footer-note">
        Please confirm customer details before order processing. This quotation remains subject to final written acceptance.
      </div>
      ${salespersonLine ? `<!-- Salesperson: ${escapeHtml(salespersonLine)} -->` : ''}
    </main>
  </body>
</html>`;
}

function renderQuoteDocumentLineItemRow(item: QuoteDocumentLineItem, className = 'item-row'): string {
  const description = item.descriptionLines.map((line) => line.toUpperCase()).join('\n');
  const amount = formatPlainMoney(item.amount);

  return `<tr class="${className}">
            <td class="qty-col">${item.quantity}</td>
            <td><div class="description">${escapeHtml(description)}</div></td>
            <td class="price-cell">${amount}</td>
            <td class="price-cell">${amount}</td>
          </tr>`;
}

function renderDetailRows(rows: Array<{ label: string; value: string | null | undefined; wide?: boolean }>): string {
  return rows
    .filter(({ value }) => Boolean(value?.trim()))
    .map(({ label, value, wide }) => {
      return `<div class="detail-row${wide ? ' wide' : ''}">
              <span>${escapeHtml(label)}</span>
              <strong>${escapeHtml(value?.trim() ?? '')}</strong>
            </div>`;
    })
    .join('');
}

const JEDIDIAH_LOGO_DATA_URI =
  'data:image/jpeg;base64,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';

function toDisplayLines(value: string | null | undefined): string[] {
  return value
    ? value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
    : [];
}

function formatDateOnly(date: Date): string {
  const day = date.getUTCDate().toString().padStart(2, '0');
  const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const year = date.getUTCFullYear().toString();

  return `${day}/${month}/${year}`;
}

function formatPlainMoney(value: number): string {
  const rounded = roundMoney(value);
  const sign = rounded < 0 ? '-' : '';
  const [integerPart = '0', decimalPart = '00'] = Math.abs(rounded).toFixed(2).split('.');

  return `${sign}${integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}.${decimalPart}`;
}

function formatPercentValue(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(2)}%`;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
