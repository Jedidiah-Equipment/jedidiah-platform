import type { QuoteComputedSummary } from '@pkg/domain';
import type { QuoteDetail } from '@pkg/schema';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';

import { QuoteRightPanel } from './QuoteRightPanel.js';

vi.mock('../StartJobLink.js', () => ({ StartJobLink: () => null }));

test('shows labour and Parts beneath each Work Item so the aside breakdown adds up', () => {
  const workItem = {
    department: 'fabrication' as const,
    description: 'Strip and rebuild pump',
    hourlyRate: 850,
    hours: 2,
    name: null,
    parts: [
      { name: 'Long bolts', quantity: 10, unitPrice: 200 },
      { name: 'Seal kit', quantity: 1, unitPrice: 1_500 },
    ],
  };
  const quote = {
    code: 33,
    customerAddress: null,
    customerCompanyName: 'Acme Hydraulics',
    customerContactPerson: 'John van der Merwe',
    customerEmail: 'john@example.com',
    customerPhone: '+27825550142',
    customerThumbnailDataUrl: null,
    customerVatNumber: null,
    id: '550e8400-e29b-41d4-a716-446655440000',
    job: null,
    kind: 'custom',
    product: null,
    quotedBasePrice: 0,
    quotedCurrencyCode: 'ZAR',
    status: 'sent',
    workItems: [workItem],
    workTitle: 'Hydraulic pump overhaul',
  } as unknown as QuoteDetail;
  const summary: QuoteComputedSummary = {
    basePrice: 0,
    currencyCode: 'ZAR',
    deliveryIncluded: true,
    deliveryPrice: 0,
    discountAmount: 0,
    discountPercent: 0,
    selectedAssemblies: [],
    selectedAssemblyTotal: 0,
    subtotal: 5_200,
    total: 5_980,
    vatAmount: 780,
    vatPercent: 15,
    workItems: [workItem],
    workItemTotal: 5_200,
  };

  const html = renderToStaticMarkup(<QuoteRightPanel quote={quote} summary={summary} />);

  // A departmental Work Item is labelled by the shop's quoting wording for its Department.
  expect(html).toContain('Fabrication');
  expect(html).toContain('Labour');
  expect(html).toContain('2.00 h × R 850.00');
  expect(html).toContain('R 1 700.00');
  expect(html).toContain('Long bolts');
  expect(html).toContain('10 × R 200.00');
  expect(html).toContain('R 2 000.00');
  expect(html).toContain('Seal kit');
  expect(html).toContain('R 1 500.00');
});
