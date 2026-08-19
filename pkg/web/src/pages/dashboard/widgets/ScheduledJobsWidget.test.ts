import type { ScheduledJob } from '@pkg/domain';
import { DateOnlyIso } from '@pkg/schema';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { buildJobSummary } from '@/test/job-fixtures.js';

import { ScheduledJobRow, scheduledJobSubtitle } from './ScheduledJobsWidget.js';

const scheduledJob = (jobId: ScheduledJob['jobId']): ScheduledJob => ({
  bayId: '10000000-0000-4000-8000-000000000000',
  bayName: 'Fabrication Bay 1',
  jobId,
  operatorName: 'Bonginkosi',
  startDate: DateOnlyIso.parse('2026-08-20'),
});

describe('ScheduledJobRow', () => {
  it('shows the Product offering icon', () => {
    const job = buildJobSummary({ productThumbnailDataUrl: null, quoteKind: 'product' });
    const html = renderToStaticMarkup(
      createElement(ScheduledJobRow, { canOpenJobs: false, job, scheduledJob: scheduledJob(job.id) }),
    );

    expect(html).toContain('data-size="default"');
    expect(html).toContain('tabler-icon-package');
    expect(html).not.toContain('tabler-icon-tools');
  });

  it('shows the Custom work offering icon', () => {
    const job = buildJobSummary({
      productName: null,
      productThumbnailDataUrl: null,
      quoteKind: 'custom',
      workTitle: 'Pump skid rebuild',
    });
    const html = renderToStaticMarkup(
      createElement(ScheduledJobRow, { canOpenJobs: false, job, scheduledJob: scheduledJob(job.id) }),
    );

    expect(html).toContain('tabler-icon-tools');
    expect(html).not.toContain('tabler-icon-package');
  });
});

describe('scheduledJobSubtitle', () => {
  it('names where the work is before what the work is', () => {
    expect(scheduledJobSubtitle('Bonginkosi', 'Agri lowbed 14 ton')).toBe('Bonginkosi - Agri lowbed 14 ton');
  });

  /** The caller passes the Bay name for an unmanned Bay, so the row never loses its location. */
  it('reads the same shape when the Bay name stands in for a missing operator', () => {
    expect(scheduledJobSubtitle('Fabrication Bay 3', 'Agri lowbed 14 ton')).toBe(
      'Fabrication Bay 3 - Agri lowbed 14 ton',
    );
  });

  it('falls back to whichever half it has', () => {
    expect(scheduledJobSubtitle(null, 'Agri lowbed 14 ton')).toBe('Agri lowbed 14 ton');
    expect(scheduledJobSubtitle('Bonginkosi', null)).toBe('Bonginkosi');
  });

  it('has nothing to say when neither half has arrived', () => {
    expect(scheduledJobSubtitle(null, null)).toBeNull();
  });
});
