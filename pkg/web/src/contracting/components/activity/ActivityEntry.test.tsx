import type { ActivityItem } from '@pkg/schema/contracting';
import { describe, expect, it } from 'vitest';

import { renderWithRouter } from '@/test/router-harness.js';

import { ActivityEntry, type ActivityScope } from './ActivityEntry.js';

const job = {
  id: '00000000-0000-4000-8000-000000000002',
  jobNumber: 'CJOB-00037',
  farmName: 'Rietvlei',
  customerName: 'Van Wyk Boerdery',
  foremanUserId: 'sipho',
};
const breakdown = {
  id: '00000000-0000-4000-8000-000000000003',
  urgency: 'code-red',
  status: 'reported',
  subject: { kind: 'machine', id: '00000000-0000-4000-8000-000000000004', code: 'T-12', categoryName: 'Tractors' },
  jobId: job.id,
};
const base = {
  id: '00000000-0000-4000-8000-000000000001',
  occurredAt: '2026-10-13T08:00:00.000Z',
  actor: { id: 'sipho', name: 'Sipho Dlamini', thumbnailDataUrl: null },
};
const jobNote = { ...base, type: 'job-note', job, text: 'Gate code is 4471' } as ActivityItem;
const breakdownNote = { ...base, type: 'breakdown-note', breakdown, job, text: 'Hose split again' } as ActivityItem;
const cancelled = { ...base, type: 'job-cancelled', job, reason: 'Rain all week' } as ActivityItem;

const JOB_HREF = 'href="/contracting/jobs/CJOB-00037"';
const BREAKDOWN_HREF = `href="/contracting/workshop/${breakdown.id}"`;

const render = (item: ActivityItem, scope: Partial<ActivityScope> = {}) =>
  renderWithRouter(<ActivityEntry item={item} scope={{ canOpenJob: true, ...scope }} />);

describe('ActivityEntry', () => {
  it('draws a note as a bubble from its author, with a link to its Job', async () => {
    const html = await render(jobNote);

    expect(html).toContain('Sipho Dlamini');
    expect(html).toContain('Gate code is 4471');
    expect(html).toContain(JOB_HREF);
    expect(html).toContain('CJOB-00037 · Rietvlei');
  });

  it('links a Breakdown note to its Breakdown rather than its Job', async () => {
    const html = await render(breakdownNote);

    expect(html).toContain(BREAKDOWN_HREF);
    expect(html).toContain('T-12 · CJOB-00037');
    expect(html).not.toContain(JOB_HREF);
  });

  it('names a Job without a dead link for a reader the Job page refuses', async () => {
    const html = await render(jobNote, { canOpenJob: false });

    expect(html).toContain('CJOB-00037 · Rietvlei');
    expect(html).not.toContain(JOB_HREF);
  });

  it('drops the link back to the thread the entry already sits in', async () => {
    expect(await render(jobNote, { jobId: job.id })).not.toContain(JOB_HREF);
    expect(await render(breakdownNote, { breakdownId: breakdown.id })).not.toContain(BREAKDOWN_HREF);
    // A Job's thread holds its Breakdowns' entries too, and those still open their Breakdown.
    expect(await render(breakdownNote, { jobId: job.id })).toContain(BREAKDOWN_HREF);
  });

  it('reads an event as its sentence and detail, linked to its record', async () => {
    const html = await render(cancelled);

    expect(html).toContain('Sipho Dlamini cancelled CJOB-00037');
    expect(html).toContain('Rain all week');
    expect(html).toContain(JOB_HREF);
  });
});
