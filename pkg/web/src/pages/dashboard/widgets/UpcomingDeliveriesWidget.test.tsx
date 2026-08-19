import {
  DateOnlyIso,
  type UpcomingDeliveryQuote,
  UpcomingDeliveryQuote as UpcomingDeliveryQuoteSchema,
} from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { renderWithRouter } from '@/test/router-harness.js';

import { UpcomingDeliveryRow } from './UpcomingDeliveriesWidget.js';

const today = DateOnlyIso.parse('2026-08-19');

describe('UpcomingDeliveryRow', () => {
  it.each([
    ['product', 'tabler-icon-package', 'tabler-icon-tools'],
    ['custom', 'tabler-icon-tools', 'tabler-icon-package'],
  ] as const)('uses the larger %s offering thumbnail', async (kind, expectedIcon, otherIcon) => {
    const html = await renderWithRouter(
      <UpcomingDeliveryRow
        canOpenJobs
        finishDatesByJobId={new Map()}
        quote={buildUpcomingDelivery(kind)}
        today={today}
      />,
    );

    expect(html).toContain('data-size="default"');
    expect(html).toContain(expectedIcon);
    expect(html).not.toContain(otherIcon);
    expect(html).toContain('text-inherit');
    expect(html).not.toContain('text-primary');
    expect(html.indexOf('Jedidiah Contracting')).toBeLessThan(html.indexOf('QUO-00030'));
    expect(html.match(/href="\/quotes\/20000000-0000-4000-8000-000000000000\/edit"/g)).toHaveLength(2);
    expect(html).toContain('job=30000000-0000-4000-8000-000000000000');
  });
});

function buildUpcomingDelivery(kind: 'custom' | 'product'): UpcomingDeliveryQuote {
  const shared = {
    code: 30,
    createdAt: '2026-08-01T08:00:00.000Z',
    customerCompanyName: 'Jedidiah Contracting',
    customerId: '10000000-0000-4000-8000-000000000000',
    customerThumbnailDataUrl: null,
    deliveryIncluded: true,
    deliveryPrice: 0,
    depositPercent: 50,
    discountPercent: 0,
    documentNotes: null,
    id: '20000000-0000-4000-8000-000000000000',
    job: {
      jobCode: 26,
      jobDescription: 'Idler damper build',
      jobId: '30000000-0000-4000-8000-000000000000',
    },
    notes: null,
    plannedDeliveryDate: '2026-08-20',
    preferredDeliveryDate: null,
    productUnitId: null,
    quotedBasePrice: 100_000,
    quotedCurrencyCode: 'ZAR',
    salesPersonEmail: null,
    salesPersonId: 'sales-user',
    salesPersonName: null,
    salesPersonThumbnailDataUrl: null,
    selectedAssemblies: [],
    status: 'accepted',
    statusChangedAt: '2026-08-01T08:00:00.000Z',
    updatedAt: '2026-08-01T08:00:00.000Z',
    validUntil: null,
  };

  return UpcomingDeliveryQuoteSchema.parse(
    kind === 'product'
      ? {
          ...shared,
          kind,
          productId: '40000000-0000-4000-8000-000000000000',
          product: {
            buildTimeDays: 10,
            currencyCode: 'ZAR',
            modelCode: 'IDL-15',
            name: 'Idler damper 15m CNC',
            thumbnailDataUrl: null,
          },
          workTitle: null,
        }
      : {
          ...shared,
          kind,
          product: null,
          productId: null,
          workItems: [],
          workTitle: 'Idler damper repair',
        },
  );
}
