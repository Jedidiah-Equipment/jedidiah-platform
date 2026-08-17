import { type GeneralFeedbackActivityItem, JobChangeActivityItem } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { renderWithRouter } from '@/test/router-harness.js';

import { JobActivityCard } from './JobActivityCard.js';

const THUMBNAIL_DATA_URL = 'data:image/webp;base64,YWN0b3I=';

describe('JobActivityCard', () => {
  // Placing the entry — which Job, which offering, whose it is — is what the feed adds over the Job's
  // own feedback list, and nothing below this card pins that those facts reach the screen.
  it('places the entry by offering, Job, Product, and Customer without its serial', async () => {
    const html = await renderWithRouter(<JobActivityCard item={buildItem()} />);

    expect(html).toContain('aria-label="Cane 8 ton"');
    expect(html).toContain('class="font-mono font-medium text-muted-foreground">JOB-00042');
    expect(html).toContain('Cane 8 ton');
    expect(html).not.toContain('SN-2026-0042');
    expect(html).toContain('Acme Mining');
  });

  it('reads a Job whose machine nobody owns as Stock', async () => {
    const html = await renderWithRouter(<JobActivityCard item={buildItem({ customerCompanyName: null })} />);

    expect(html).toContain('Stock');
  });

  it('links the whole entry to the Job Sheet and the icon to the Gantt', async () => {
    const html = await renderWithRouter(<JobActivityCard item={buildItem()} />);

    expect(html).toContain('href="/jobs/activity?job=30000000-0000-4000-8000-000000000000"');
    expect(html).toContain('href="/jobs?job=30000000-0000-4000-8000-000000000000"');
  });

  // The toggle itself is driven by measuring the clamped paragraph, which needs layout — so it is
  // verified in the browser, and what static markup can pin is that the clamp is on to begin with.
  it('clamps the feedback so one long note cannot run away with the feed', async () => {
    const html = await renderWithRouter(<JobActivityCard item={buildItem({ text: 'A note. '.repeat(60) })} />);

    expect(html).toContain('line-clamp-4');
  });

  it('clamps short feedback too, since how many lines it wraps to depends on the column', async () => {
    const html = await renderWithRouter(<JobActivityCard item={buildItem()} />);

    expect(html).toContain('line-clamp-4');
  });

  it.each([
    ['job-created', 'created this Job'],
    ['job-description-updated', 'changed the Job description'],
    ['job-completed', 'completed this Job'],
    ['job-document-added', 'added a document'],
  ] as const)('says who did what for a %s change event', async (type, sentence) => {
    const html = await renderWithRouter(<JobActivityCard item={buildChangeItem(type)} />);

    expect(html).toContain('Thabo Mokoena');
    expect(html).toContain(sentence);
    expect(html).toContain('JOB-00042');
  });

  it('names the file a document entry is about', async () => {
    const html = await renderWithRouter(<JobActivityCard item={buildChangeItem('job-document-added')} />);

    expect(html).toContain('handover.pdf');
  });

  it('reads a cleared description as cleared rather than as an empty change', async () => {
    const item = buildChangeItem('job-description-updated', { description: null });

    const html = await renderWithRouter(<JobActivityCard item={item} />);

    expect(html).toContain('cleared the Job description');
  });

  // The audit row keeps the event after its actor is deleted, so the sentence must survive too.
  it('keeps the verb when the acting user is gone', async () => {
    const item = buildChangeItem('job-created', { actor: null });

    const html = await renderWithRouter(<JobActivityCard item={item} />);

    expect(html).toContain('A removed user');
    expect(html).toContain('created this Job');
  });

  it('leaves a change event unclamped, since its payload is never a paragraph', async () => {
    const html = await renderWithRouter(<JobActivityCard item={buildChangeItem('job-created')} />);

    expect(html).not.toContain('line-clamp-4');
    expect(html).not.toContain('Show more');
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
  overrides: { customerCompanyName?: string | null; text?: string } = {},
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
        thumbnailDataUrl: THUMBNAIL_DATA_URL,
      },
      text: (overrides.text ??
        'Paint bay handover was missed on this job.') as GeneralFeedbackActivityItem['feedback']['text'],
    },
  };
}
