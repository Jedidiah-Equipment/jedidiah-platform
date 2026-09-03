import { formatDate, statusBadgeColorClassNames } from '@pkg/domain';
import { type GeneralFeedbackActivityItem, JobChangeActivityItem } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { renderWithRouter } from '@/test/router-harness.js';

import { JobActivityEntry } from './JobActivityEntry.js';

const THUMBNAIL_DATA_URL = 'data:image/webp;base64,YWN0b3I=';

describe('JobActivityEntry', () => {
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

  it('links the whole entry to the Job Sheet and the icon to the Gantt', async () => {
    const html = await renderWithRouter(<JobActivityEntry item={buildItem()} />);

    expect(html).toContain('href="/equipment/jobs/activity?job=30000000-0000-4000-8000-000000000000"');
    expect(html).toContain('href="/equipment/jobs?job=30000000-0000-4000-8000-000000000000"');
  });

  it('can hide repeated Job detail while keeping the feedback', async () => {
    const html = await renderWithRouter(<JobActivityEntry hideDetail item={buildItem()} />);

    expect(html).toContain('Paint bay handover was missed on this job.');
    expect(html).not.toContain('>JOB-00042<');
    expect(html).not.toContain('aria-label="Cane 8 ton"');
    expect(html).not.toContain('Acme Mining');
    expect(html).not.toContain('href="/equipment/jobs/activity?job=30000000-0000-4000-8000-000000000000"');
    expect(html).not.toContain('href="/equipment/jobs?job=30000000-0000-4000-8000-000000000000"');
  });

  it('keeps the submitter discoverable when their avatar has no image', async () => {
    const html = await renderWithRouter(<JobActivityEntry item={buildItem({ submitterThumbnailDataUrl: null })} />);

    expect(html).toContain('aria-label="Thabo"');
    expect(html).toContain('>T<');
    expect(html).not.toContain('Thabo Mokoena');
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
    ['job-created', 'created this Job'],
    ['job-description-updated', 'changed the Job description'],
    ['job-completed', 'completed this Job'],
    ['job-document-added', 'added a document'],
  ] as const)('says who did what for a %s change event', async (type, sentence) => {
    const html = await renderWithRouter(<JobActivityEntry item={buildChangeItem(type)} />);

    expect(html).toContain('>Thabo<');
    expect(html).not.toContain('Thabo Mokoena');
    expect(html).toContain(sentence);
    expect(html).toContain('JOB-00042');
  });

  it('uses the Product visual for a non-feedback event', async () => {
    const html = await renderWithRouter(<JobActivityEntry item={buildChangeItem('job-completed')} />);

    expect(html).toContain('aria-label="Cane 8 ton"');
    expect(html).toContain('tabler-icon-package');
    expect(html).toContain('tabler-icon-check');
    expect(html).toContain('font-mono font-medium text-muted-foreground text-sm">JOB-00042');
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

  it('top-aligns a non-feedback title with its activity icon', async () => {
    const html = await renderWithRouter(<JobActivityEntry item={buildChangeItem('job-completed')} />);

    expect(html).not.toContain('min-w-0 pt-1.5');
    expect(html).toContain('truncate text-sm leading-6');
    expect(html).toContain('font-medium text-sm">Thabo');
  });

  it('keeps the feedback Job footer one size below non-feedback text', async () => {
    const html = await renderWithRouter(<JobActivityEntry item={buildItem()} />);

    expect(html).toContain('border-t border-border/70 bg-muted/40 py-1 pe-1.5 ps-3 text-xs');
    expect(html).not.toContain('font-mono font-medium text-muted-foreground text-sm">JOB-00042');
  });

  it('reads a cleared description as cleared rather than as an empty change', async () => {
    const item = buildChangeItem('job-description-updated', { description: null });

    const html = await renderWithRouter(<JobActivityEntry item={item} />);

    expect(html).toContain('cleared the Job description');
  });

  it('keeps event-specific detail when repeated Job detail is hidden', async () => {
    const html = await renderWithRouter(
      <JobActivityEntry hideDetail item={buildChangeItem('job-description-updated')} />,
    );

    expect(html).toContain('Fit the heavy-duty boom.');
    expect(html).not.toContain('>JOB-00042<');
    expect(html).not.toContain('href="/equipment/jobs/activity?job=30000000-0000-4000-8000-000000000000"');
    expect(html).not.toContain('href="/equipment/jobs?job=30000000-0000-4000-8000-000000000000"');
  });

  // The nightly completion sweep audits with a null actor deliberately, and a deleted user's row is
  // nulled by the FK too — indistinguishable, and the Audit table already calls both "System".
  it('names a change nobody is recorded for System, matching the Audit table', async () => {
    const item = buildChangeItem('job-completed', { actor: null });

    const html = await renderWithRouter(<JobActivityEntry item={item} />);

    expect(html).toContain('System');
    expect(html).toContain('completed this Job');
    expect(html).not.toContain('A removed user');
  });

  it('does not repeat a Job completion date already represented by the timeline', async () => {
    const item = buildChangeItem('job-completed', { completedOn: '2026-08-10' });

    const html = await renderWithRouter(<JobActivityEntry item={item} />);
    const text = html.replaceAll(/<[^>]*>/g, ' ');

    expect(text).not.toContain(formatDate('2026-08-10'));
  });

  it('shows a Job completion date when it differs from the audit timeline day', async () => {
    const item = buildChangeItem('job-completed', {
      completedOn: '2026-08-09',
      occurredAt: '2026-08-10T09:00:00.000Z',
    });

    const html = await renderWithRouter(<JobActivityEntry item={item} />);

    expect(html).toContain(formatDate('2026-08-09'));
  });

  it.each([
    ['started', 'started Fabrication work', null],
    ['completed', 'completed Fabrication work', 'Fiona Fabricator'],
    ['corrected', 'corrected Fabrication work times', `${formatDate('2026-08-01')} → ${formatDate('2026-08-04')}`],
    ['cleared', 'cleared Fabrication work times', null],
  ] as const)('describes a %s work-time change from its curated state', async (action, sentence, detail) => {
    const item = buildChangeItem('job-work-time-updated', {
      action,
      timing:
        action === 'cleared'
          ? null
          : {
              completedAt: action === 'started' ? null : '2026-08-04T15:00:00.000Z',
              crew: action === 'started' ? [] : ['Fiona Fabricator'],
              startedAt: '2026-08-01T09:00:00.000Z',
            },
    });

    const html = await renderWithRouter(<JobActivityEntry item={item} />);
    const text = html.replaceAll(/<[^>]*>/g, ' ');

    expect(text).toContain(sentence);
    if (detail === null) expect(text).not.toContain('In progress');
    else expect(text).toContain(detail);
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
