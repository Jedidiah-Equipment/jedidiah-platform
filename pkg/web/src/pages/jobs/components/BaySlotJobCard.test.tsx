import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';

import { buildJobSummary } from '@/test/job-fixtures.js';

import { BaySlotJobCard } from './BaySlotJobCard.js';

test('marks cancelled Job slots without hiding their identity', () => {
  const job = buildJobSummary({ cancelledAt: '2026-07-17T08:00:00.000Z' });

  const html = renderToStaticMarkup(
    <BaySlotJobCard dayBreakdown={{ closureDays: 0, overtimeDays: 0, workingDays: 2 }} job={job} jobCode={job.code} />,
  );

  expect(html).toContain('JOB-00001');
  expect(html).toContain('Cancelled');
});
