import { DateIso, DateOnlyIso, JobMaterialVarianceResult } from '@pkg/schema';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { describeVarianceJob, JobVarianceReport } from './JobVarianceReport.js';

const report = JobMaterialVarianceResult.parse({
  items: [
    {
      actualCost: 1_500,
      drawnQuantity: 6,
      partCode: 'RAW-100',
      partId: '00000000-0000-4000-8000-000000000001',
      partName: 'Channel',
      plannedQuantity: 4,
      unitOfMeasure: 'mm',
      varianceQuantity: 2,
    },
    {
      actualCost: null,
      drawnQuantity: 3,
      partCode: 'FAB-200',
      partId: '00000000-0000-4000-8000-000000000002',
      partName: 'Bracket',
      plannedQuantity: 0,
      unitOfMeasure: 'piece',
      varianceQuantity: 3,
    },
  ],
  job: {
    cancelledAt: null,
    closedOutAt: null,
    code: 1,
    completedOn: null,
    displayName: 'Channel fabrication',
    id: '00000000-0000-4000-8000-000000000009',
  },
  offCfoActualCost: null,
  totalActualCost: null,
});

describe('JobVarianceReport', () => {
  it('shows planned, drawn, and variance, flagging the Part the CFO never planned', () => {
    const html = renderToStaticMarkup(<JobVarianceReport report={report} showCosts={false} />);

    expect(html).toContain('Planned');
    expect(html).toContain('Drawn');
    expect(html).toContain('Variance');
    expect(html).toContain('Off CFO');
    expect(html).toContain('2 parts');
    // Counted totals reach a price-blind reader; the money column is the cost gate's and does not.
    expect(html).toContain('Over plan');
    expect(html).not.toContain('Actual cost');
    expect(html).not.toContain('Drawn cost');
  });

  it('prices the drawn column for a cost reader and says so when a Part has no cost yet', () => {
    const html = renderToStaticMarkup(<JobVarianceReport report={report} showCosts={true} />);

    expect(html).toContain('Actual cost');
    expect(html).toContain('No cost yet');
    // One unpriced Part makes the whole total unpriced rather than quietly smaller.
    expect(html).toContain('not priced');
  });

  it('says where a Job stands, because the report is read after close-out as often as before', () => {
    expect(describeVarianceJob({ ...report.job, closedOutAt: DateIso.parse('2026-08-03T09:00:00.000Z') })).toContain(
      'closed out',
    );
    expect(describeVarianceJob({ ...report.job, completedOn: DateOnlyIso.parse('2026-08-03') })).toContain('completed');
    expect(describeVarianceJob(report.job)).toContain('still running');
  });
});
