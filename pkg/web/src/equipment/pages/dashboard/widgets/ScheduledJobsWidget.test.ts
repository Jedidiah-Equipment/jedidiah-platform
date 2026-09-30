import type { ScheduledJob } from '@pkg/domain/equipment';
import { DateOnlyIso } from '@pkg/schema';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { buildJobSummary } from '@/equipment/test/job-fixtures.js';

import { ScheduledJobRow, scheduledJobSubtitle } from './ScheduledJobsWidget.js';

describe('ScheduledJobRow', () => {
  it('keeps the physical Bay before the work title when its Operator is unassigned', () => {
    const job = buildJobSummary({ quoteKind: 'custom', productName: null, workTitle: 'Pump skid rebuild' });
    const scheduledJob: ScheduledJob = {
      bayId: '10000000-0000-4000-8000-000000000000',
      bayName: 'Fabrication Bay 1',
      jobId: job.id,
      operatorName: 'Piet Pompies',
      startDate: DateOnlyIso.parse('2026-08-20'),
    };
    const render = (operatorName: string | null) =>
      renderToStaticMarkup(
        createElement(ScheduledJobRow, { canOpenJobs: false, job, scheduledJob: { ...scheduledJob, operatorName } }),
      );

    expect(render('Piet Pompies')).toContain('Piet Pompies - Fabrication Bay 1 - Pump skid rebuild');
    const unassigned = render(null);
    expect(unassigned).toContain('Fabrication Bay 1 - No operator - Pump skid rebuild');
    expect(unassigned).not.toContain('Piet Pompies');
  });
});

describe('scheduledJobSubtitle', () => {
  it('names where the work is before what the work is', () => {
    expect(scheduledJobSubtitle('Bonginkosi', 'Agri lowbed 14 ton')).toBe('Bonginkosi - Agri lowbed 14 ton');
  });

  it('falls back to whichever half it has', () => {
    expect(scheduledJobSubtitle(null, 'Agri lowbed 14 ton')).toBe('Agri lowbed 14 ton');
    expect(scheduledJobSubtitle('Bonginkosi', null)).toBe('Bonginkosi');
  });

  it('has nothing to say when neither half has arrived', () => {
    expect(scheduledJobSubtitle(null, null)).toBeNull();
  });
});
