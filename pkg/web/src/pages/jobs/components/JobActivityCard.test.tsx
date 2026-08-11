import type { GeneralFeedbackActivityItem } from '@pkg/schema';
import { describe, expect, it } from 'vitest';

import { renderWithRouter } from '@/test/router-harness.js';

import { JobActivityCard } from './JobActivityCard.js';

const THUMBNAIL_DATA_URL = 'data:image/webp;base64,YWN0b3I=';

describe('JobActivityCard', () => {
  // Placing the entry — which Job, which machine, whose it is — is what the feed adds over the Job's
  // own feedback list, and nothing below this card pins that those facts reach the screen.
  it('places the entry by Job, Product, serial, and Customer', async () => {
    const html = await renderWithRouter(<JobActivityCard item={buildItem()} />);

    expect(html).toContain('JOB-00042');
    expect(html).toContain('Cane 8 ton');
    expect(html).toContain('SN-2026-0042');
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

  it('leaves short feedback unclamped and offers no toggle', async () => {
    const html = await renderWithRouter(<JobActivityCard item={buildItem()} />);

    expect(html).not.toContain('line-clamp-4');
    expect(html).not.toContain('Show more');
  });

  it('clamps long feedback behind a Show more toggle', async () => {
    const html = await renderWithRouter(<JobActivityCard item={buildItem({ text: 'A note. '.repeat(60) })} />);

    expect(html).toContain('line-clamp-4');
    expect(html).toContain('Show more');
  });

  it('clamps feedback that is short but runs past four lines', async () => {
    const html = await renderWithRouter(<JobActivityCard item={buildItem({ text: 'Line.\n'.repeat(6) })} />);

    expect(html).toContain('line-clamp-4');
    expect(html).toContain('Show more');
  });
});

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
      serialNumber: 'SN-2026-0042',
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
