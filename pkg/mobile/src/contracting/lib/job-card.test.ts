import { describe, expect, test } from 'vitest';
import { jobCardShareAction } from './job-card';

describe('jobCardShareAction', () => {
  test('downloads the chosen variant from the Job Card route under its own file name', () => {
    expect(jobCardShareAction('CJOB-00042', 'internal')).toEqual({
      path: '/api/contracting/jobs/CJOB-00042/job-card?variant=internal',
      contentType: 'application/pdf',
      filename: 'CJOB-00042-job-card-internal.pdf',
      cacheKey: 'CJOB-00042',
    });
  });
});
