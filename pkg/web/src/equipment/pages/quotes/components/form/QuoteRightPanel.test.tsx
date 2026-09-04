import { type QuoteComputedSummary, quoteKindLabels } from '@pkg/domain/equipment';
import type { QuoteDetail } from '@pkg/schema/equipment';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { renderWithRouter } from '@/test/router-harness.js';

import { QuoteRightPanel } from './QuoteRightPanel.js';

vi.mock('../StartJobLink.js', () => ({
  StartJobLink: ({ className }: { className?: string }) => <span className={className} data-start-job-link />,
}));
vi.mock('../ReassignUnitDialog.js', () => ({ ReassignUnitDialog: () => null }));

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
    productUnitId: null,
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

  const html = renderToStaticMarkup(
    <QuoteRightPanel
      canOpenJobs
      jobScheduleError={null}
      jobScheduleState={null}
      quote={quote}
      summary={summary}
      onOpenJob={() => undefined}
    />,
  );

  expect(html).toContain('aria-label="Hydraulic pump overhaul"');
  expect(html.split(`>${quoteKindLabels.custom}<`)).toHaveLength(2);
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
  expect(html).toContain('min-w-0 flex-1 break-words');

  const startJobLinkIndex = html.indexOf('data-start-job-link');
  const quoteTotalIndex = html.indexOf('Quote total');
  expect(startJobLinkIndex).toBeGreaterThan(-1);
  expect(startJobLinkIndex).toBeLessThan(quoteTotalIndex);
});

test('opens a linked Job from the quote aside or locates it on the planner', async () => {
  const quote = {
    code: 'QUO-00033',
    customerAddress: null,
    customerCompanyName: 'Acme Hydraulics',
    customerContactPerson: null,
    customerEmail: null,
    customerPhone: null,
    customerThumbnailDataUrl: null,
    customerVatNumber: null,
    id: '550e8400-e29b-41d4-a716-446655440000',
    job: {
      jobCode: 'JOB-00042',
      jobDescription: 'Build hydraulic power pack',
      jobId: '420e8400-e29b-41d4-a716-446655440000',
    },
    kind: 'custom',
    product: null,
    quotedBasePrice: 0,
    quotedCurrencyCode: 'ZAR',
    status: 'accepted',
    workItems: [],
    workTitle: 'Hydraulic power pack',
  } as unknown as QuoteDetail;
  const summary = {
    basePrice: 0,
    currencyCode: 'ZAR',
    deliveryIncluded: true,
    deliveryPrice: 0,
    discountAmount: 0,
    discountPercent: 0,
    selectedAssemblies: [],
    selectedAssemblyTotal: 0,
    subtotal: 0,
    total: 0,
    vatAmount: 0,
    vatPercent: 15,
    workItems: [],
    workItemTotal: 0,
  } satisfies QuoteComputedSummary;

  const html = await renderWithRouter(
    <QuoteRightPanel
      canOpenJobs
      jobScheduleError={null}
      jobScheduleState={{
        active: 1,
        done: 1,
        firstWorkDay: null,
        lastWorkDay: null,
        scheduled: 2,
        total: 4,
      }}
      quote={quote}
      summary={summary}
      onOpenJob={() => undefined}
    />,
  );

  expect(html).toContain('JOB-00042');
  expect(html).toContain('Build hydraulic power pack');
  expect(html).toContain('1 Done');
  expect(html).toContain('1 Active');
  expect(html).toContain('2 Scheduled');
  expect(html).toContain('>Open</button>');
  expect(html).not.toContain('/equipment/jobs/list');
  expect(html).toContain('href="/equipment/jobs?job=420e8400-e29b-41d4-a716-446655440000"');
});
