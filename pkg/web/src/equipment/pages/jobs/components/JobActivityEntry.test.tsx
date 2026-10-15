import { statusBadgeColorClassNames } from '@pkg/domain';
import { type GeneralFeedbackActivityItem, JobChangeActivityItem, PurchaseOrderCode } from '@pkg/schema/equipment';
import { describe, expect, it } from 'vitest';

import { renderWithRouter } from '@/test/router-harness.js';

import { JobActivityEntry } from './JobActivityEntry.js';

const THUMBNAIL_DATA_URL = 'data:image/webp;base64,YWN0b3I=';
const JOB_ID = '30000000-0000-4000-8000-000000000000';

describe('JobActivityEntry', () => {
  it('links the PO marker only for a reader with PO access', async () => {
    const item = {
      ...buildItem(),
      purchaseOrder: {
        id: '00000000-0000-4000-8000-000000000042',
        code: PurchaseOrderCode.parse(42),
        supplierName: 'Mount Fifty',
      },
    };
    const allowed = await renderWithRouter(<JobActivityEntry canReadPurchaseOrder item={item} />);
    const denied = await renderWithRouter(<JobActivityEntry item={item} />);
    expect(allowed).toContain('href="/equipment/purchase-orders/00000000-0000-4000-8000-000000000042"');
    expect(denied).not.toContain('href="/equipment/purchase-orders/');
    expect(denied).toContain('PO-00042');
  });

  it("keeps the PO marker inside the Job's own thread", async () => {
    const item = {
      ...buildItem(),
      purchaseOrder: {
        id: '00000000-0000-4000-8000-000000000042',
        code: PurchaseOrderCode.parse(42),
        supplierName: 'Mount Fifty',
      },
    };
    const html = await renderWithRouter(<JobActivityEntry item={item} jobId={JOB_ID} />);
    expect(html).toContain('PO-00042');
    expect(html).toContain('Mount Fifty');
    expect(html).not.toContain('>JOB-00042<');
  });

  // Placing the entry — which Job, which offering, whose it is — is what the feed adds over the Job's
  // own feedback list, and nothing below this card pins that those facts reach the screen.
  it('places the entry by offering, Job, Product, and Customer without its serial', async () => {
    const html = await renderWithRouter(<JobActivityEntry item={buildItem()} />);

    expect(html).toContain('aria-label="Cane 8 ton"');
    expect(html).toContain('>JOB-00042<');
    expect(html).toContain('Cane 8 ton');
    expect(html).not.toContain('SN-2026-0042');
    expect(html).toContain('Acme Mining');
  });

  it('reads a Job whose machine nobody owns as Stock', async () => {
    const html = await renderWithRouter(<JobActivityEntry item={buildItem({ customerCompanyName: null })} />);

    expect(html).toContain('Stock');
  });

  it('links the Job to its Job Sheet and the icon to the Gantt', async () => {
    const html = await renderWithRouter(<JobActivityEntry item={buildItem()} />);

    expect(html).toContain('href="/equipment/jobs/activity?job=30000000-0000-4000-8000-000000000000"');
    expect(html).toContain('href="/equipment/jobs?job=30000000-0000-4000-8000-000000000000"');
  });

  it('stops naming the Job inside its own thread while keeping the feedback', async () => {
    const html = await renderWithRouter(<JobActivityEntry item={buildItem()} jobId={JOB_ID} />);

    expect(html).toContain('Paint bay handover was missed on this job.');
    expect(html).not.toContain('>JOB-00042<');
    expect(html).not.toContain('aria-label="Cane 8 ton"');
    expect(html).not.toContain('Acme Mining');
    expect(html).not.toContain('href="/equipment/jobs/activity?job=30000000-0000-4000-8000-000000000000"');
    expect(html).not.toContain('href="/equipment/jobs?job=30000000-0000-4000-8000-000000000000"');
  });

  it('keeps the submitter discoverable when their avatar has no image', async () => {
    const html = await renderWithRouter(<JobActivityEntry item={buildItem({ submitterThumbnailDataUrl: null })} />);

    // The avatar keeps the full name for its label and initials; the bubble shows the first name.
    expect(html).toContain('aria-label="Thabo Mokoena"');
    expect(html).toContain('>TM<');
    expect(html).toContain('>Thabo<');
  });

  // The toggle itself is driven by measuring the clamped paragraph, which needs layout — so it is
  // verified in the browser, and what static markup can pin is that the clamp is on to begin with.
  it('clamps the feedback so one long note cannot run away with the feed', async () => {
    const html = await renderWithRouter(<JobActivityEntry item={buildItem({ text: 'A note. '.repeat(60) })} />);

    expect(html).toContain('line-clamp-4');
  });

  it('clamps short feedback too, since how many lines it wraps to depends on the column', async () => {
    const html = await renderWithRouter(<JobActivityEntry item={buildItem()} />);

    expect(html).toContain('line-clamp-4');
  });

  it.each([
    ['job-created', 'tabler-icon-plus'],
    ['job-description-updated', 'tabler-icon-pencil'],
    ['job-completed', 'tabler-icon-check'],
    ['job-document-added', 'tabler-icon-file-text'],
    ['job-work-time-updated', 'tabler-icon-clock'],
  ] as const)('renders the %s event with its web icon', async (type, iconClassName) => {
    const html = await renderWithRouter(<JobActivityEntry item={buildChangeItem(type)} />);

    expect(html).toContain(iconClassName);
  });

  it('renders the actor and event sentence beside the Job', async () => {
    const html = await renderWithRouter(<JobActivityEntry item={buildChangeItem('job-created')} />);

    expect(html).toContain('>Thabo<');
    expect(html).toContain('created this Job');
    expect(html).toContain('JOB-00042');
  });

  it('uses the Product visual for a non-feedback event', async () => {
    const html = await renderWithRouter(<JobActivityEntry item={buildChangeItem('job-completed')} />);

    expect(html).toContain('aria-label="Cane 8 ton"');
    expect(html).toContain('tabler-icon-package');
    expect(html).toContain('tabler-icon-check');
    expect(html).toContain('>JOB-00042<');
  });

  it('uses the custom-work icon for a non-feedback event without a thumbnail', async () => {
    const item = buildChangeItem('job-created', {
      job: { ...buildItem().job, displayName: 'Hydraulic repair', offeringKind: 'custom', thumbnailDataUrl: null },
    });

    const html = await renderWithRouter(<JobActivityEntry item={item} />);

    expect(html).toContain('aria-label="Hydraulic repair"');
    expect(html).toContain('tabler-icon-tools');
    expect(html).toContain('tabler-icon-plus');
  });

  it('uses standard category colors for Job events and Work Times', async () => {
    const jobEventHtml = await renderWithRouter(<JobActivityEntry item={buildChangeItem('job-completed')} />);
    const workTimeHtml = await renderWithRouter(<JobActivityEntry item={buildChangeItem('job-work-time-updated')} />);

    expect(jobEventHtml).toContain(statusBadgeColorClassNames.purple.chip);
    expect(jobEventHtml).toContain(statusBadgeColorClassNames.purple.text);
    expect(workTimeHtml).toContain(statusBadgeColorClassNames.blue.chip);
    expect(workTimeHtml).toContain(statusBadgeColorClassNames.blue.text);
  });

  it('draws a Job event as a record, not a person: a rounded square', async () => {
    const html = await renderWithRouter(<JobActivityEntry item={buildChangeItem('job-completed')} />);

    expect(html).toContain('rounded-lg border');
    expect(html).toContain('font-medium">Thabo');
  });

  it('keeps the feedback Job footer one size below non-feedback text', async () => {
    const html = await renderWithRouter(<JobActivityEntry item={buildItem()} />);

    expect(html).toContain('bg-muted/40 px-3.5 py-1.5 text-muted-foreground text-xs');
  });

  it("keeps event-specific detail inside the Job's own thread", async () => {
    const html = await renderWithRouter(
      <JobActivityEntry item={buildChangeItem('job-description-updated')} jobId={JOB_ID} />,
    );

    expect(html).toContain('Fit the heavy-duty boom.');
    expect(html).not.toContain('>JOB-00042<');
    expect(html).not.toContain('href="/equipment/jobs/activity?job=30000000-0000-4000-8000-000000000000"');
    expect(html).not.toContain('href="/equipment/jobs?job=30000000-0000-4000-8000-000000000000"');
  });
});

/** Built through the real schema, so a fixture cannot drift from the contract it stands in for. */
function buildChangeItem(
  type: JobChangeActivityItem['type'],
  overrides: Record<string, unknown> = {},
): JobChangeActivityItem {
  const payloads: Record<JobChangeActivityItem['type'], Record<string, unknown>> = {
    'job-completed': { completedOn: '2026-08-10' },
    'job-created': {},
    'job-description-updated': { description: 'Fit the heavy-duty boom.' },
    'job-document-added': { document: { contentType: 'application/pdf', filename: 'handover.pdf' } },
    'job-work-time-updated': {
      action: 'started',
      department: 'fabrication',
      timing: { completedAt: null, crew: [], startedAt: '2026-08-01T09:00:00.000Z' },
    },
  };

  return JobChangeActivityItem.parse({
    id: '20000000-0000-4000-8000-000000000000',
    occurredAt: '2026-08-10T09:00:00.000Z',
    job: buildItem().job,
    actor: {
      email: 'thabo@example.com',
      id: 'user-1',
      name: 'Thabo Mokoena',
      thumbnailDataUrl: THUMBNAIL_DATA_URL,
    },
    ...payloads[type],
    ...overrides,
    type,
  });
}

function buildItem(
  overrides: { customerCompanyName?: string | null; submitterThumbnailDataUrl?: string | null; text?: string } = {},
): GeneralFeedbackActivityItem {
  return {
    type: 'general-feedback',
    purchaseOrder: null,
    id: '10000000-0000-4000-8000-000000000000' as GeneralFeedbackActivityItem['id'],
    occurredAt: '2026-08-10T09:00:00.000Z' as GeneralFeedbackActivityItem['occurredAt'],
    job: {
      id: '30000000-0000-4000-8000-000000000000' as GeneralFeedbackActivityItem['job']['id'],
      code: 'JOB-00042' as GeneralFeedbackActivityItem['job']['code'],
      customerCompanyName: overrides.customerCompanyName === undefined ? 'Acme Mining' : overrides.customerCompanyName,
      displayName: 'Cane 8 ton',
      offeringKind: 'product',
      thumbnailDataUrl: null,
    },
    feedback: {
      submitter: {
        email: 'thabo@example.com',
        id: 'user-1' as GeneralFeedbackActivityItem['feedback']['submitter']['id'],
        name: 'Thabo Mokoena',
        thumbnailDataUrl:
          overrides.submitterThumbnailDataUrl === undefined ? THUMBNAIL_DATA_URL : overrides.submitterThumbnailDataUrl,
      },
      text: (overrides.text ??
        'Paint bay handover was missed on this job.') as GeneralFeedbackActivityItem['feedback']['text'],
    },
  };
}
